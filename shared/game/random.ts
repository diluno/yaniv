/**
 * Abstraction over randomness so the game domain stays deterministic in tests.
 * Production implementations must be backed by crypto-grade randomness.
 */
export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). maxExclusive >= 1. */
  nextInt(maxExclusive: number): number
}

export function shuffleInPlace<T>(items: T[], random: RandomSource): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1)
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

/** Deterministic source for tests: cycles through provided values (mod maxExclusive). */
export function createSeededRandom(seed: number): RandomSource {
  // Mulberry32 PRNG — deterministic, test-only.
  let state = seed >>> 0
  return {
    nextInt(maxExclusive: number): number {
      state |= 0
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      const float = ((t ^ (t >>> 14)) >>> 0) / 4294967296
      return Math.floor(float * maxExclusive)
    },
  }
}
