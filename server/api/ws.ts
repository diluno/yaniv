import type { Peer } from 'crossws'
import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions'
import { MAX_WS_MESSAGE_BYTES } from '../../shared/protocol/client-messages'
import { createWsConnection, type WsConnection } from '../services/ws-session'

const connections = new WeakMap<Peer, WsConnection>()

/** Local/dev (and any Node host): Nitro's crossws-based WebSocket handling. */
const crosswsHandler = defineWebSocketHandler({
  open(peer) {
    connections.set(peer, createWsConnection(message => peer.send(JSON.stringify(message))))
  },

  async message(peer, message) {
    await connections.get(peer)?.handleMessage(message.text())
  },

  async close(peer) {
    const connection = connections.get(peer)
    connections.delete(peer)
    await connection?.handleClose()
  },
})

/** Vercel: the platform upgrade API — Nitro's preset cannot upgrade sockets. */
const vercelHandler = defineEventHandler(() => {
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
})

export default process.env.VERCEL ? vercelHandler : crosswsHandler
