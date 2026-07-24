import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import Redis from 'ioredis'
import { RedisRoomRepository } from '../../server/repositories/redis-room-repository'
import { executeAction, mutateRoom, authenticatePlayer } from '../../server/services/action-service'
import { createRoom, joinRoom } from '../../server/services/room-service'
import { roomChannel, roomKey, useRedis } from '../../server/utils/redis'
import { hashToken } from '../../server/utils/auth'
import { DomainError } from '../../shared/game/errors'

// Requires a Redis at localhost:6379 (docker run -p 6379:6379 redis:7-alpine).

const redis = useRedis()
const repo = new RedisRoomRepository(redis)

afterAll(async () => {
  redis.disconnect()
})

async function createStartedRoom() {
  const host = await createRoom('Host')
  const guest = await joinRoom(host.roomCode, 'Guest')
  // Both connected so the match can start.
  await mutateRoom(host.roomCode, (room) => {
    for (const p of room.players) p.connectionStatus = 'connected'
  })
  await executeAction({
    code: host.roomCode,
    playerId: host.playerId,
    playerToken: host.playerToken,
    actionId: crypto.randomUUID(),
    expectedVersion: undefined,
    action: { type: 'start_match' },
  })
  return { host, guest }
}

describe('room lifecycle', () => {
  it('creates a room with hashed token and TTL', async () => {
    const creds = await createRoom('Sam')
    const room = await repo.requireRoom(creds.roomCode)
    expect(room.players[0]!.tokenHash).toBe(hashToken(creds.playerToken))
    expect(JSON.stringify(room)).not.toContain(creds.playerToken)
    const ttl = await redis.ttl(roomKey(creds.roomCode))
    expect(ttl).toBeGreaterThan(3600)
    expect(ttl).toBeLessThanOrEqual(7200)
  })

  it('rejects duplicate names and full rooms', async () => {
    const creds = await createRoom('Sam')
    await joinRoom(creds.roomCode, 'David')
    await expect(joinRoom(creds.roomCode, ' DAVID  ')).rejects.toMatchObject({ code: 'DUPLICATE_NAME' })
    await joinRoom(creds.roomCode, 'Three')
    await joinRoom(creds.roomCode, 'Four')
    await expect(joinRoom(creds.roomCode, 'Five')).rejects.toMatchObject({ code: 'ROOM_FULL' })
  })

  it('authenticates by token and rejects bad tokens', async () => {
    const creds = await createRoom('Sam')
    const room = await repo.requireRoom(creds.roomCode)
    expect(authenticatePlayer(room, creds.playerToken).id).toBe(creds.playerId)
    expect(() => authenticatePlayer(room, 'not-a-token-not-a-token')).toThrow(DomainError)
  })

  it('room expiry: missing key raises ROOM_NOT_FOUND', async () => {
    await expect(repo.requireRoom('ZZZZZZ')).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
  })
})

describe('compare-and-set', () => {
  beforeEach(async () => {
    await redis.flushdb()
  })

  it('succeeds on the correct version and fails on a stale one', async () => {
    const creds = await createRoom('Sam')
    const room = await repo.requireRoom(creds.roomCode)
    const next = structuredClone(room)
    next.version = room.version + 1
    expect(await repo.compareAndSet(next, room.version)).toBe(true)
    //

    const staleNext = structuredClone(room)
    staleNext.version = room.version + 1
    expect(await repo.compareAndSet(staleNext, room.version)).toBe(false)
  })

  it('publishes the committed version on the room channel', async () => {
    const creds = await createRoom('Sam')
    const sub = new Redis('redis://localhost:6379')
    const received = new Promise<{ roomCode: string, version: number }>((resolve) => {
      sub.on('message', (_channel, message) => resolve(JSON.parse(message)))
    })
    await sub.subscribe(roomChannel(creds.roomCode))
    const committed = await mutateRoom(creds.roomCode, (room) => {
      room.players[0]!.connectionStatus = 'connected'
    })
    const payload = await received
    expect(payload.roomCode).toBe(creds.roomCode)
    expect(payload.version).toBe(committed!.version)
    sub.disconnect()
  })

  it('two simultaneous actions cannot both consume the same turn', async () => {
    const { host, guest } = await createStartedRoom()
    const room = await repo.requireRoom(host.roomCode)
    const current = room.players.find(p => p.id === room.game!.currentTurnPlayerId)!
    const creds = current.id === host.playerId ? host : guest
    const makeAttempt = () => executeAction({
      code: host.roomCode,
      playerId: creds.playerId,
      playerToken: creds.playerToken,
      actionId: crypto.randomUUID(),
      expectedVersion: room.version,
      action: {
        type: 'play_turn',
        discardCardIds: [current.hand[0]!],
        draw: { source: 'deck' },
      },
    })
    const results = await Promise.allSettled([makeAttempt(), makeAttempt()])
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    expect(fulfilled).toHaveLength(1)
    const after = await repo.requireRoom(host.roomCode)
    expect(after.game!.currentTurnPlayerId).not.toBe(current.id)
  })

  it('duplicate action IDs are idempotent', async () => {
    const { host, guest } = await createStartedRoom()
    const room = await repo.requireRoom(host.roomCode)
    const current = room.players.find(p => p.id === room.game!.currentTurnPlayerId)!
    const creds = current.id === host.playerId ? host : guest
    const actionId = crypto.randomUUID()
    const request = {
      code: host.roomCode,
      playerId: creds.playerId,
      playerToken: creds.playerToken,
      actionId,
      expectedVersion: undefined,
      action: {
        type: 'play_turn' as const,
        discardCardIds: [current.hand[0]!],
        draw: { source: 'deck' as const },
      },
    }
    const first = await executeAction(request)
    const second = await executeAction(request)
    expect(second.duplicate).toBe(true)
    expect(second.version).toBe(first.version)
    const after = await repo.requireRoom(host.roomCode)
    expect(after.version).toBe(first.version)
  })

  it('TTL refreshes when the room mutates', async () => {
    const creds = await createRoom('Sam')
    await redis.expire(roomKey(creds.roomCode), 100)
    await mutateRoom(creds.roomCode, (room) => {
      room.players[0]!.connectionStatus = 'connected'
    })
    const ttl = await redis.ttl(roomKey(creds.roomCode))
    expect(ttl).toBeGreaterThan(3600)
  })
})
