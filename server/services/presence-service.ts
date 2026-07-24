import type { RoomState } from '../../shared/types/room'
import { HOST_TRANSFER_GRACE_MS } from '../../shared/game/constants'
import { mutateRoom } from './action-service'

function pauseOrResume(room: RoomState): void {
  if (room.status !== 'playing' && room.status !== 'paused') return
  const required = room.players.filter(p => !p.eliminated && p.connectionStatus !== 'left')
  const anyMissing = required.some(p => p.connectionStatus !== 'connected')
  if (room.status === 'playing' && anyMissing && room.game?.phase === 'awaiting_turn') {
    room.status = 'paused'
  }
  else if (room.status === 'paused' && !anyMissing) {
    room.status = 'playing'
  }
}

/** Transfer host to the longest-connected active player after the grace period. */
function maybeTransferHost(room: RoomState, now: Date): void {
  const host = room.players.find(p => p.id === room.hostPlayerId)
  if (!host) return
  const gone = host.connectionStatus === 'left'
    || (host.connectionStatus === 'disconnected'
      && host.disconnectedAt
      && now.getTime() - Date.parse(host.disconnectedAt) >= HOST_TRANSFER_GRACE_MS)
  if (!gone) return
  const candidates = room.players
    .filter(p => p.id !== host.id && p.connectionStatus === 'connected' && !p.eliminated)
    .sort((a, b) => Date.parse(a.connectedAt ?? '') - Date.parse(b.connectedAt ?? ''))
  if (candidates.length > 0) room.hostPlayerId = candidates[0]!.id
}

export async function markPlayerConnected(code: string, playerId: string): Promise<RoomState | null> {
  const now = new Date()
  return mutateRoom(code, (room) => {
    const player = room.players.find(p => p.id === playerId)
    if (!player || player.connectionStatus === 'left') return false
    player.connectionStatus = 'connected'
    player.connectedAt = player.connectedAt ?? now.toISOString()
    player.disconnectedAt = null
    player.lastSeenAt = now.toISOString()
    pauseOrResume(room)
    maybeTransferHost(room, now)
  })
}

export async function markPlayerDisconnected(code: string, playerId: string): Promise<RoomState | null> {
  const now = new Date()
  return mutateRoom(code, (room) => {
    const player = room.players.find(p => p.id === playerId)
    if (!player || player.connectionStatus !== 'connected') return false
    player.connectionStatus = 'disconnected'
    player.disconnectedAt = now.toISOString()
    player.lastSeenAt = now.toISOString()
    pauseOrResume(room)
    maybeTransferHost(room, now)
  })
}

export async function touchPresence(code: string, playerId: string): Promise<void> {
  // Heartbeats refresh lastSeenAt without a full versioned commit storm:
  // only commit when something meaningful changed (reconnect detection).
  await mutateRoom(code, (room) => {
    const player = room.players.find(p => p.id === playerId)
    if (!player || player.connectionStatus === 'connected') return false
    player.connectionStatus = 'connected'
    player.disconnectedAt = null
    pauseOrResume(room)
  })
}
