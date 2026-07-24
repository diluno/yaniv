import type { RoomState } from '../../shared/types/room'
import { GAME_CONFIG, TTL_SECONDS } from '../../shared/game/constants'
import { DomainError } from '../../shared/game/errors'
import { createLobbyRoom, createPlayer } from '../../shared/game/room-factory'
import { generatePlayerId, generatePlayerToken, hashToken } from '../utils/auth'
import { generateRoomCode } from '../utils/room-code'
import { nameKey, normalizeDisplayName } from '../utils/display-name'
import { useRoomRepository } from '../repositories/redis-room-repository'
import { mutateRoom } from './action-service'

export interface SeatCredentials {
  roomCode: string
  sharePath: string
  playerId: string
  playerToken: string
}

export async function createRoom(displayNameInput: string): Promise<SeatCredentials> {
  const repo = useRoomRepository()
  const displayName = normalizeDisplayName(displayNameInput)
  const playerId = generatePlayerId()
  const playerToken = generatePlayerToken()
  const now = new Date()

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode()
    const room = createLobbyRoom({
      code,
      now,
      expiresAt: new Date(now.getTime() + TTL_SECONDS.lobby * 1000),
      host: { id: playerId, tokenHash: hashToken(playerToken), displayName },
    })
    if (await repo.createRoom(room)) {
      return { roomCode: code, sharePath: `/room/${code}`, playerId, playerToken }
    }
  }
  throw new DomainError('INTERNAL_ERROR', 'Could not allocate a room code.', false)
}

export async function joinRoom(code: string, displayNameInput: string): Promise<SeatCredentials> {
  const displayName = normalizeDisplayName(displayNameInput)
  const playerId = generatePlayerId()
  const playerToken = generatePlayerToken()
  const tokenHash = hashToken(playerToken)

  await mutateRoom(code, (room: RoomState) => {
    if (room.status !== 'lobby') {
      throw new DomainError('ROOM_ALREADY_STARTED', 'This match has already started.')
    }
    if (room.players.length >= GAME_CONFIG.maxPlayers) {
      throw new DomainError('ROOM_FULL', 'This room already has four players.')
    }
    if (room.players.some(p => nameKey(p.displayName) === nameKey(displayName))) {
      throw new DomainError('DUPLICATE_NAME', 'That name is already taken in this room.')
    }
    const seat = Math.max(-1, ...room.players.map(p => p.seat)) + 1
    room.players.push(createPlayer({ id: playerId, tokenHash, displayName }, seat))
  })

  return { roomCode: code, sharePath: `/room/${code}`, playerId, playerToken }
}
