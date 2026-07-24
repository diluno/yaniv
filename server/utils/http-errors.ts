import type { H3Event } from 'h3'
import { createError, getRequestIP } from 'h3'
import { DomainError, type DomainErrorCode } from '../../shared/game/errors'

const STATUS_BY_CODE: Partial<Record<DomainErrorCode, number>> = {
  ROOM_NOT_FOUND: 404,
  ROOM_EXPIRED: 404,
  AUTH_REQUIRED: 401,
  AUTH_INVALID: 401,
  NOT_HOST: 403,
  NOT_A_PLAYER: 403,
  ROOM_FULL: 409,
  ROOM_ALREADY_STARTED: 409,
  DUPLICATE_NAME: 409,
  STALE_STATE: 409,
  INVALID_NAME: 400,
  INVALID_PAYLOAD: 400,
  ACTION_RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

export function toHttpError(error: unknown): ReturnType<typeof createError> {
  if (error instanceof DomainError) {
    return createError({
      statusCode: STATUS_BY_CODE[error.code] ?? 400,
      statusMessage: error.code,
      data: { code: error.code, message: error.message },
    })
  }
  return createError({
    statusCode: 500,
    statusMessage: 'INTERNAL_ERROR',
    data: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
  })
}

export function clientIdentity(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}
