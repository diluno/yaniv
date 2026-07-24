import { describe, expect, it } from 'vitest'
import { resolveRound, transformScore } from '../../shared/game/scoring'

// Hands are expressed as card IDs; values derive from the shared deck.
const player = (id: string, hand: string[], score = 0) => ({ id, hand, score })

describe('transformScore', () => {
  it('resets exactly 50 to 0', () => {
    expect(transformScore(45, 5)).toEqual({ score: 0, resetApplied: 'fifty', eliminated: false })
  })

  it('resets exactly 100 to 50', () => {
    expect(transformScore(90, 10)).toEqual({ score: 50, resetApplied: 'hundred', eliminated: false })
  })

  it('eliminates above 100', () => {
    expect(transformScore(95, 6)).toEqual({ score: 101, resetApplied: null, eliminated: true })
  })

  it('keeps ordinary scores', () => {
    expect(transformScore(40, 9)).toEqual({ score: 49, resetApplied: null, eliminated: false })
  })
})

describe('resolveRound — successful Yaniv', () => {
  it('caller adds 0, others add hand value', () => {
    const result = resolveRound([
      player('a', ['clubs-A', 'clubs-2']), // 3
      player('b', ['hearts-K']), // 10
      player('c', ['spades-5']), // 5
    ], 'a')
    expect(result.outcome).toBe('yaniv')
    expect(result.entries.find(e => e.playerId === 'a')!.pointsAdded).toBe(0)
    expect(result.entries.find(e => e.playerId === 'b')!.pointsAdded).toBe(10)
    expect(result.entries.find(e => e.playerId === 'c')!.pointsAdded).toBe(5)
    expect(result.nextStarterPlayerId).toBe('a')
  })
})

describe('resolveRound — Assaf', () => {
  it('triggers on a strictly lower opponent', () => {
    const result = resolveRound([
      player('a', ['spades-5']), // caller, 5
      player('b', ['clubs-3']), // 3 — assaf
      player('c', ['hearts-K']), // 10
    ], 'a')
    expect(result.outcome).toBe('assaf')
    expect(result.assafWinnerPlayerIds).toEqual(['b'])
    expect(result.entries.find(e => e.playerId === 'a')!.pointsAdded).toBe(35) // 5 + 30
    expect(result.entries.find(e => e.playerId === 'b')!.pointsAdded).toBe(0)
    expect(result.entries.find(e => e.playerId === 'c')!.pointsAdded).toBe(10)
  })

  it('triggers on an equal opponent hand', () => {
    const result = resolveRound([
      player('a', ['spades-4']), // caller, 4
      player('b', ['clubs-4']), // equal 4 — assaf
    ], 'a')
    expect(result.outcome).toBe('assaf')
    expect(result.assafWinnerPlayerIds).toEqual(['b'])
    expect(result.entries.find(e => e.playerId === 'a')!.pointsAdded).toBe(34)
    expect(result.nextStarterPlayerId).toBe('b')
  })

  it('lets multiple tied lowest opponents all add 0', () => {
    const result = resolveRound([
      player('a', ['spades-5']), // caller 5
      player('b', ['clubs-2']), // 2
      player('c', ['hearts-2']), // 2
      player('d', ['diamonds-4']), // 4 (<= caller but not lowest)
    ], 'a')
    expect(result.outcome).toBe('assaf')
    expect(result.assafWinnerPlayerIds.sort()).toEqual(['b', 'c'])
    expect(result.entries.find(e => e.playerId === 'b')!.pointsAdded).toBe(0)
    expect(result.entries.find(e => e.playerId === 'c')!.pointsAdded).toBe(0)
    expect(result.entries.find(e => e.playerId === 'd')!.pointsAdded).toBe(4)
    // tie broken clockwise after the caller
    expect(result.nextStarterPlayerId).toBe('b')
  })
})

describe('resolveRound — resets and elimination', () => {
  it('applies exact-50 reset before elimination', () => {
    const result = resolveRound([
      player('a', ['clubs-A']), // caller wins
      player('b', ['hearts-5'], 45), // 45 + 5 = 50 → 0
    ], 'a')
    const b = result.entries.find(e => e.playerId === 'b')!
    expect(b.scoreAfter).toBe(0)
    expect(b.resetApplied).toBe('fifty')
    expect(b.eliminated).toBe(false)
  })

  it('resets exact 100 to 50 instead of eliminating', () => {
    const result = resolveRound([
      player('a', ['clubs-A']),
      player('b', ['hearts-10'], 90), // 90 + 10 = 100 → 50
    ], 'a')
    const b = result.entries.find(e => e.playerId === 'b')!
    expect(b.scoreAfter).toBe(50)
    expect(b.resetApplied).toBe('hundred')
    expect(b.eliminated).toBe(false)
  })

  it('eliminates at 101', () => {
    const result = resolveRound([
      player('a', ['clubs-A']),
      player('b', ['hearts-6', 'clubs-5'], 90), // 90 + 11 = 101
      player('c', ['spades-9'], 10),
    ], 'a')
    expect(result.entries.find(e => e.playerId === 'b')!.eliminated).toBe(true)
  })

  it('keeps the lowest post-round scorer active when a round would eliminate everyone', () => {
    // A player who adds 0 (the caller on Yaniv or an Assaf winner) can never
    // exceed 100, so the all-eliminated guard is defensive. Verify it: the
    // eliminated caller stays eliminated while the lowest survivor remains.
    const result = resolveRound([
      player('a', ['hearts-K'], 95), // caller 10, opponent equal → assafed: 95+40=135
      player('b', ['spades-K'], 60), // 10, assaf winner adds 0 → 60
    ], 'a')
    expect(result.outcome).toBe('assaf')
    expect(result.entries.find(e => e.playerId === 'a')!.eliminated).toBe(true)
    expect(result.entries.find(e => e.playerId === 'b')!.eliminated).toBe(false)
    expect(result.nextStarterPlayerId).toBe('b')
  })

  it('ties for lowest post-round score keep multiple players active', () => {
    const result = resolveRound([
      player('a', ['hearts-9', 'clubs-2'], 95), // caller 11, no lower opponent? b=12,c=12 → yaniv. 0 added → 95 stays.
      player('b', ['spades-6', 'clubs-6'], 95), // 12 → 107
      player('c', ['hearts-6', 'diamonds-6'], 95), // 12 → 107
    ], 'a')
    expect(result.outcome).toBe('yaniv')
    expect(result.entries.find(e => e.playerId === 'a')!.eliminated).toBe(false)
    expect(result.entries.find(e => e.playerId === 'b')!.eliminated).toBe(true)
    expect(result.entries.find(e => e.playerId === 'c')!.eliminated).toBe(true)
  })
})
