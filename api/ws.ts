// Native Vercel Function for the WebSocket endpoint. The Nitro preset for
// Vercel cannot upgrade connections, so production traffic to /api/ws lands
// here instead (filesystem api/ routes take precedence over framework routes).
import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions'
import { MAX_WS_MESSAGE_BYTES } from '../shared/protocol/client-messages'
import { createWsConnection } from '../server/services/ws-session'

export async function GET() {
  return experimental_upgradeWebSocket((ws) => {
    const connection = createWsConnection((message) => {
      try {
        ws.send(JSON.stringify(message))
      }
      catch {
        // Socket already closed.
      }
    })

    ws.on('message', (data: WebSocketData) => {
      void connection.handleMessage(String(data))
    })

    ws.on('close', () => {
      void connection.handleClose()
    })
  }, { maxPayload: MAX_WS_MESSAGE_BYTES })
}
