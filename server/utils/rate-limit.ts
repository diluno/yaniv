import { createHash } from 'node:crypto'
import { DomainError } from '../../shared/game/errors'
import { useRedis } from './redis'

/** Fixed-window rate limit keyed by hashed identity. Throws when exceeded. */
export async function enforceRateLimit(
  bucket: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 16)
  const key = `yaniv:rate:${bucket}:${hash}`
  const redis = useRedis()
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSeconds)
  if (count > limit) {
    throw new DomainError('ACTION_RATE_LIMITED', 'Too many requests. Please slow down.')
  }
}
