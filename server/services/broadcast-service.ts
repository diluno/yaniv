import type { RoomState } from '../../shared/types/room'
import { projectRoomForPlayer } from '../../shared/game/projection'
import type { ServerMessage } from '../../shared/protocol/server-messages'
import { useRoomRepository } from '../repositories/redis-room-repository'
import { roomChannel, useRedisSubscriber } from '../utils/redis'
import { logEvent } from '../utils/log'

export interface RoomPeer {
  playerId: string
  send: (message: ServerMessage) => void
}

// Local sockets grouped by room; one Redis subscription per room, not per socket.
const peersByRoom = new Map<string, Set<RoomPeer>>()
let subscriberWired = false

function ensureSubscriberWired(): void {
  if (subscriberWired) return
  subscriberWired = true
  const sub = useRedisSubscriber()
  sub.on('message', (channel: string, message: string) => {
    const code = channel.replace(/^yaniv:room:/, '').replace(/:pub$/, '')
    void fanOutRoom(code, message)
  })
}

async function fanOutRoom(code: string, message: string): Promise<void> {
  const peers = peersByRoom.get(code)
  if (!peers || peers.size === 0) return
  try {
    const room = await useRoomRepository().getRoom(code)
    if (!room) return
    // Skip stale notifications: only fan out the newest committed version.
    const payload = JSON.parse(message) as { version?: number }
    if (typeof payload.version === 'number' && payload.version < room.version) return
    broadcastRoomState(room)
  }
  catch (error) {
    logEvent('websocket_error', { roomCode: code, message: String(error) })
  }
}

/** Send each local peer their private projection of the given state. */
export function broadcastRoomState(room: RoomState): void {
  const peers = peersByRoom.get(room.code)
  if (!peers) return
  for (const peer of peers) {
    if (!room.players.some(p => p.id === peer.playerId)) continue
    try {
      peer.send({ type: 'snapshot', snapshot: projectRoomForPlayer(room, peer.playerId) })
    }
    catch {
      // Socket may have died between close detection and send; ignore.
    }
  }
}

export async function registerPeer(code: string, peer: RoomPeer): Promise<void> {
  ensureSubscriberWired()
  let peers = peersByRoom.get(code)
  if (!peers) {
    peers = new Set()
    peersByRoom.set(code, peers)
    await useRedisSubscriber().subscribe(roomChannel(code))
  }
  peers.add(peer)
}

export async function unregisterPeer(code: string, peer: RoomPeer): Promise<void> {
  const peers = peersByRoom.get(code)
  if (!peers) return
  peers.delete(peer)
  if (peers.size === 0) {
    peersByRoom.delete(code)
    await useRedisSubscriber().unsubscribe(roomChannel(code))
  }
}

/** Existing peers for the same seat (used to close superseded connections). */
export function peersForPlayer(code: string, playerId: string): RoomPeer[] {
  return [...(peersByRoom.get(code) ?? [])].filter(p => p.playerId === playerId)
}
