import type { Peer } from 'crossws'
import { createWsConnection, type WsConnection } from '../services/ws-session'

const connections = new WeakMap<Peer, WsConnection>()

export default defineWebSocketHandler({
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
