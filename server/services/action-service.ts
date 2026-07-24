import type { GameAction } from '../../shared/protocol/actions'
import type { RoomState } from '../../shared/types/room'
import { RECENT_ACTION_IDS_LIMIT } from '../../shared/game/constants'
import { DomainError } from '../../shared/game/errors'
import { applyAction } from '../../shared/game/reducer'
import { tokenMatchesHash, createCryptoRandom } from '../utils/auth'
import { useRoomRepository } from '../repositories/redis-room-repository'

const CAS_RETRIES = 3

/**
 * Generic CAS mutation loop: load → mutate (throws to reject) → commit.
 * `mutator` mutates the state in place; version bump is handled here.
 * Returns the committed state, or null if `mutator` returned false (no-op).
 */
export async function mutateRoom(
  code: string,
  mutator: (room: RoomState) => void | false,
): Promise<RoomState | null> {
  const repo = useRoomRepository()
  for (let attempt = 0; attempt <= CAS_RETRIES; attempt++) {
    const room = await repo.requireRoom(code)
    const expectedVersion = room.version
    const next = structuredClone(room)
    if (mutator(next) === false) return null
    next.version = expectedVersion + 1
    next.updatedAt = new Date().toISOString()
    if (await repo.compareAndSet(next, expectedVersion)) return next
  }
  throw new DomainError('STALE_STATE', 'The room changed while processing. Please retry.')
}

export function authenticatePlayer(room: RoomState, playerToken: string): RoomState['players'][number] {
  for (const player of room.players) {
    if (tokenMatchesHash(playerToken, player.tokenHash)) return player
  }
  throw new DomainError('AUTH_INVALID', 'Your seat token is not valid for this room.')
}

export interface ActionResult {
  room: RoomState
  version: number
  duplicate: boolean
}

/**
 * Full action pipeline: idempotency check, expectedVersion check, pure
 * reducer, atomic commit with retry. Publishing happens inside the CAS Lua.
 */
export async function executeAction(params: {
  code: string
  playerId: string
  playerToken: string
  actionId: string
  expectedVersion: number | undefined
  action: GameAction
}): Promise<ActionResult> {
  const repo = useRoomRepository()

  for (let attempt = 0; attempt <= CAS_RETRIES; attempt++) {
    const room = await repo.requireRoom(params.code)
    const actor = authenticatePlayer(room, params.playerToken)
    if (actor.id !== params.playerId) {
      throw new DomainError('AUTH_INVALID', 'Token does not match this player.')
    }

    const duplicate = room.recentActionIds.find(a => a.actionId === params.actionId)
    if (duplicate) {
      return { room, version: duplicate.resultingVersion, duplicate: true }
    }

    if (params.expectedVersion !== undefined && params.expectedVersion !== room.version) {
      throw new DomainError('STALE_STATE', 'Your view of the game is out of date.')
    }

    const next = applyAction(room, actor.id, params.action, {
      now: new Date(),
      random: createCryptoRandom(),
    })
    next.recentActionIds.push({
      actionId: params.actionId,
      playerId: actor.id,
      resultingVersion: next.version,
    })
    if (next.recentActionIds.length > RECENT_ACTION_IDS_LIMIT) {
      next.recentActionIds = next.recentActionIds.slice(-RECENT_ACTION_IDS_LIMIT)
    }

    if (await repo.compareAndSet(next, room.version)) {
      return { room: next, version: next.version, duplicate: false }
    }
    // CAS lost: another instance committed first — reload and re-evaluate.
  }
  throw new DomainError('STALE_STATE', 'The room is busy. Please retry.')
}
