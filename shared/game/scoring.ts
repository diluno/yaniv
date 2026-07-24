import type { RoomPlayer, RoundResult, RoundResultEntry } from '../types/room'
import { GAME_CONFIG } from './constants'
import { cardsByIds } from './deck'
import { handValue } from './cards'

interface ScoreTransformResult {
  score: number
  resetApplied: 'fifty' | 'hundred' | null
  eliminated: boolean
}

/** Apply round points, then exact-50/exact-100 resets, then elimination. */
export function transformScore(previousScore: number, pointsAdded: number): ScoreTransformResult {
  const raw = previousScore + pointsAdded
  if (raw === 50) return { score: 0, resetApplied: 'fifty', eliminated: false }
  if (raw === 100) return { score: 50, resetApplied: 'hundred', eliminated: false }
  if (raw > GAME_CONFIG.eliminationScore) return { score: raw, resetApplied: null, eliminated: true }
  return { score: raw, resetApplied: null, eliminated: false }
}

/**
 * Resolve a Yaniv call among active (non-eliminated) players.
 * Does not mutate anything; returns the round result including per-player
 * score transformations and eliminations. The all-would-eliminate edge case
 * (spec 5.10) keeps the lowest post-round scorers active.
 */
export function resolveRound(
  activePlayers: Pick<RoomPlayer, 'id' | 'hand' | 'score'>[],
  callerId: string,
): RoundResult {
  const caller = activePlayers.find(p => p.id === callerId)
  if (!caller) throw new Error('Caller is not an active player')

  const values = new Map(activePlayers.map(p => [p.id, handValue(cardsByIds(p.hand))]))
  const callerValue = values.get(callerId)!

  const assafWinners = activePlayers.filter(
    p => p.id !== callerId && values.get(p.id)! <= callerValue,
  )
  const isAssaf = assafWinners.length > 0

  let lowestOpposing = Infinity
  for (const p of assafWinners) lowestOpposing = Math.min(lowestOpposing, values.get(p.id)!)
  const assafWinnerIds = assafWinners
    .filter(p => values.get(p.id)! === lowestOpposing)
    .map(p => p.id)

  const entries: RoundResultEntry[] = activePlayers.map((p) => {
    const value = values.get(p.id)!
    let pointsAdded: number
    if (!isAssaf) {
      pointsAdded = p.id === callerId ? 0 : value
    }
    else if (p.id === callerId) {
      pointsAdded = value + GAME_CONFIG.assafPenalty
    }
    else if (assafWinnerIds.includes(p.id)) {
      pointsAdded = 0
    }
    else {
      pointsAdded = value
    }
    const transform = transformScore(p.score, pointsAdded)
    return {
      playerId: p.id,
      hand: [...p.hand],
      handValue: value,
      pointsAdded,
      scoreBefore: p.score,
      scoreAfter: transform.score,
      resetApplied: transform.resetApplied,
      eliminated: transform.eliminated,
    }
  })

  // Spec 5.10: if every remaining player would be eliminated, keep the
  // lowest post-round scorers active instead.
  if (entries.every(e => e.eliminated)) {
    const lowestScore = Math.min(...entries.map(e => e.scoreAfter))
    for (const entry of entries) {
      if (entry.scoreAfter === lowestScore) entry.eliminated = false
    }
  }

  // Next round starter: lowest hand value; ties broken clockwise after caller.
  const survivors = entries.filter(e => !e.eliminated)
  let nextStarterPlayerId: string | null = null
  if (survivors.length > 0) {
    const lowestHand = Math.min(...survivors.map(e => e.handValue))
    const tied = new Set(survivors.filter(e => e.handValue === lowestHand).map(e => e.playerId))
    const order = activePlayers.map(p => p.id)
    const callerIdx = order.indexOf(callerId)
    for (let offset = 1; offset <= order.length; offset++) {
      const candidate = order[(callerIdx + offset) % order.length]!
      if (tied.has(candidate)) {
        nextStarterPlayerId = candidate
        break
      }
    }
  }

  return {
    outcome: isAssaf ? 'assaf' : 'yaniv',
    callerPlayerId: callerId,
    assafWinnerPlayerIds: assafWinnerIds,
    entries,
    nextStarterPlayerId,
  }
}
