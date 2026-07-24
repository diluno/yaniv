import type Redis from 'ioredis'
import type { RoomState } from '../../shared/types/room'
import { TTL_SECONDS } from '../../shared/game/constants'
import { DomainError } from '../../shared/game/errors'
import { roomChannel, roomKey, useRedis } from '../utils/redis'

// Compare-and-set: commits only if the stored version still matches the one
// the reducer read, then refreshes TTL and publishes the new version.
const CAS_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
local ok, decoded = pcall(cjson.decode, current)
if not ok then return -2 end
if tostring(decoded.version) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('PUBLISH', KEYS[2], ARGV[4])
return 1
`

export function ttlForStatus(status: RoomState['status']): number {
  if (status === 'lobby') return TTL_SECONDS.lobby
  if (status === 'finished') return TTL_SECONDS.finished
  return TTL_SECONDS.playing
}

export class RedisRoomRepository {
  private redis: Redis

  constructor(redis: Redis = useRedis()) {
    this.redis = redis
  }

  async createRoom(state: RoomState): Promise<boolean> {
    const result = await this.redis.set(
      roomKey(state.code),
      JSON.stringify(state),
      'EX',
      ttlForStatus(state.status),
      'NX',
    )
    return result === 'OK'
  }

  async getRoom(code: string): Promise<RoomState | null> {
    const raw = await this.redis.get(roomKey(code))
    if (!raw) return null
    return JSON.parse(raw) as RoomState
  }

  async requireRoom(code: string): Promise<RoomState> {
    const room = await this.getRoom(code)
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'This room does not exist or has expired.')
    return room
  }

  /**
   * Commit `next` only if the stored version still equals `expectedVersion`.
   * Publishes `{ roomCode, version }` on success.
   */
  async compareAndSet(next: RoomState, expectedVersion: number): Promise<boolean> {
    const payload = JSON.stringify({ roomCode: next.code, version: next.version })
    const result = await this.redis.eval(
      CAS_LUA,
      2,
      roomKey(next.code),
      roomChannel(next.code),
      String(expectedVersion),
      JSON.stringify(next),
      String(ttlForStatus(next.status)),
      payload,
    ) as number
    if (result === -1) throw new DomainError('ROOM_EXPIRED', 'This room has expired.')
    if (result === -2) throw new DomainError('INTERNAL_ERROR', 'Stored room state is corrupt.', false)
    return result === 1
  }

  /** Sliding expiry refresh on activity that does not mutate state. */
  async refreshTtl(code: string, status: RoomState['status']): Promise<void> {
    await this.redis.expire(roomKey(code), ttlForStatus(status))
  }
}

export function useRoomRepository(): RedisRoomRepository {
  return new RedisRoomRepository()
}
