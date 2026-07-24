import type { Peer } from 'crossws'
import { clientMessageSchema, MAX_WS_MESSAGE_BYTES } from '../../shared/protocol/client-messages'
import type { ServerMessage } from '../../shared/protocol/server-messages'
import { DomainError } from '../../shared/game/errors'
import { projectRoomForPlayer } from '../../shared/game/projection'
import { useRoomRepository } from '../repositories/redis-room-repository'
import { authenticatePlayer, executeAction } from '../services/action-service'
import { markPlayerConnected, markPlayerDisconnected } from '../services/presence-service'
import {
  broadcastRoomState,
  peersForPlayer,
  registerPeer,
  unregisterPeer,
  type RoomPeer,
} from '../services/broadcast-service'
import { normalizeRoomCode } from '../utils/room-code'
import { enforceRateLimit } from '../utils/rate-limit'
import { logEvent } from '../utils/log'

interface Session {
  roomCode: string
  playerId: string
  playerToken: string
  peer: RoomPeer
  closedBySupersede?: boolean
}

const sessions = new WeakMap<Peer, Session>()

function send(peer: Peer, message: ServerMessage): void {
  peer.send(JSON.stringify(message))
}

function sendError(peer: Peer, error: unknown, actionId?: string): void {
  if (error instanceof DomainError) {
    send(peer, {
      type: 'error',
      code: error.code,
      message: error.message,
      actionId,
      recoverable: error.recoverable,
    })
  }
  else {
    logEvent('websocket_error', { message: String(error) })
    send(peer, {
      type: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
      actionId,
      recoverable: true,
    })
  }
}

async function sendFreshSnapshot(session: Session): Promise<void> {
  const room = await useRoomRepository().getRoom(session.roomCode)
  if (room && room.players.some(p => p.id === session.playerId)) {
    session.peer.send({ type: 'snapshot', snapshot: projectRoomForPlayer(room, session.playerId) })
  }
}

export default defineWebSocketHandler({
  async message(peer, message) {
    const text = message.text()
    if (text.length > MAX_WS_MESSAGE_BYTES) {
      sendError(peer, new DomainError('INVALID_PAYLOAD', 'Message too large.'))
      return
    }

    let parsed
    try {
      parsed = clientMessageSchema.safeParse(JSON.parse(text))
    }
    catch {
      parsed = { success: false as const, error: null }
    }
    if (!parsed.success) {
      sendError(peer, new DomainError('INVALID_PAYLOAD', 'Malformed message.'))
      return
    }
    const msg = parsed.data
    const session = sessions.get(peer)

    // ---- authenticate ----
    if (msg.type === 'authenticate') {
      try {
        const code = normalizeRoomCode(msg.roomCode)
        const repo = useRoomRepository()
        const room = await repo.requireRoom(code)
        const player = authenticatePlayer(room, msg.playerToken)

        // Close any older connection holding the same seat.
        for (const old of peersForPlayer(code, player.id)) {
          old.send({
            type: 'error',
            code: 'AUTH_INVALID',
            message: 'This seat connected from another tab.',
            recoverable: false,
          })
        }

        const roomPeer: RoomPeer = {
          playerId: player.id,
          send: m => send(peer, m),
        }
        const newSession: Session = {
          roomCode: code,
          playerId: player.id,
          playerToken: msg.playerToken,
          peer: roomPeer,
        }
        sessions.set(peer, newSession)
        await registerPeer(code, roomPeer)

        const updated = await markPlayerConnected(code, player.id)
        const latest = updated ?? room
        send(peer, { type: 'authenticated', snapshot: projectRoomForPlayer(latest, player.id) })
        if (updated) broadcastRoomState(updated)
        logEvent('player_connected', { roomCode: code, playerId: player.id, version: latest.version })
      }
      catch (error) {
        sendError(peer, error)
      }
      return
    }

    if (!session) {
      sendError(peer, new DomainError('AUTH_REQUIRED', 'Authenticate first.'))
      return
    }

    // ---- heartbeat ----
    if (msg.type === 'heartbeat') {
      send(peer, { type: 'pong', sentAt: msg.sentAt, serverAt: Date.now() })
      try {
        const repo = useRoomRepository()
        const room = await repo.getRoom(session.roomCode)
        if (room) await repo.refreshTtl(session.roomCode, room.status)
      }
      catch {
        // TTL refresh is best-effort.
      }
      return
    }

    // ---- action ----
    if (msg.type === 'action') {
      try {
        await enforceRateLimit('action', session.playerId, 30, 10)
        const result = await executeAction({
          code: session.roomCode,
          playerId: session.playerId,
          playerToken: session.playerToken,
          actionId: msg.actionId,
          expectedVersion: msg.expectedVersion,
          action: msg.action,
        })
        send(peer, { type: 'action_ack', actionId: msg.actionId, version: result.version })
        logEvent('turn_committed', {
          roomCode: session.roomCode,
          playerId: session.playerId,
          actionType: msg.action.type,
          version: result.version,
        })
        // Pub/sub notifies every instance including this one; also push
        // directly so the actor is never behind their own ack.
        if (!result.duplicate) broadcastRoomState(result.room)
      }
      catch (error) {
        logEvent('action_rejected', {
          roomCode: session.roomCode,
          playerId: session.playerId,
          actionType: msg.action.type,
          code: error instanceof DomainError ? error.code : 'INTERNAL_ERROR',
        })
        sendError(peer, error, msg.actionId)
        // Help stale clients recover with a fresh snapshot.
        if (error instanceof DomainError && error.code === 'STALE_STATE') {
          await sendFreshSnapshot(session).catch(() => {})
        }
      }
    }
  },

  async close(peer) {
    const session = sessions.get(peer)
    if (!session) return
    sessions.delete(peer)
    try {
      await unregisterPeer(session.roomCode, session.peer)
      // If a newer socket already holds this seat, don't mark it disconnected.
      if (peersForPlayer(session.roomCode, session.playerId).length > 0) return
      const updated = await markPlayerDisconnected(session.roomCode, session.playerId)
      if (updated) broadcastRoomState(updated)
      logEvent('player_disconnected', { roomCode: session.roomCode, playerId: session.playerId })
    }
    catch (error) {
      logEvent('websocket_error', { message: String(error) })
    }
  },
})
