import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { RandomSource } from '../../shared/game/random'

/** 256 bits of secure randomness, URL-safe. */
export function generatePlayerToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function generatePlayerId(): string {
  return crypto.randomUUID()
}

/** Crypto-backed RandomSource for shuffling and starter selection. */
export function createCryptoRandom(): RandomSource {
  return {
    nextInt(maxExclusive: number): number {
      if (maxExclusive <= 1) return 0
      return randomInt(maxExclusive)
    },
  }
}
