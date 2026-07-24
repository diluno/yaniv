import type { RoomPlayer, RoomState } from '../types/room'

export function createLobbyRoom(params: {
  code: string
  now: Date
  expiresAt: Date
  host: { id: string, tokenHash: string, displayName: string }
}): RoomState {
  return {
    schemaVersion: 1,
    code: params.code,
    status: 'lobby',
    version: 1,
    createdAt: params.now.toISOString(),
    updatedAt: params.now.toISOString(),
    expiresAt: params.expiresAt.toISOString(),
    hostPlayerId: params.host.id,
    players: [createPlayer(params.host, 0)],
    game: null,
    recentActionIds: [],
  }
}

export function createPlayer(
  params: { id: string, tokenHash: string, displayName: string },
  seat: number,
): RoomPlayer {
  return {
    id: params.id,
    tokenHash: params.tokenHash,
    displayName: params.displayName,
    seat,
    connectionStatus: 'disconnected',
    connectedAt: null,
    disconnectedAt: null,
    lastSeenAt: null,
    score: 0,
    eliminated: false,
    hand: [],
    readyForNextRound: false,
  }
}
