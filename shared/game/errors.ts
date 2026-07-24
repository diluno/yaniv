export type DomainErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'ROOM_ALREADY_STARTED'
  | 'ROOM_NOT_IN_LOBBY'
  | 'ROOM_NOT_PLAYING'
  | 'ROOM_PAUSED'
  | 'NOT_HOST'
  | 'NOT_A_PLAYER'
  | 'PLAYER_ELIMINATED'
  | 'NOT_YOUR_TURN'
  | 'STALE_STATE'
  | 'DUPLICATE_NAME'
  | 'INVALID_NAME'
  | 'INVALID_PAYLOAD'
  | 'CARD_NOT_IN_HAND'
  | 'DUPLICATE_CARD_ID'
  | 'INVALID_DISCARD'
  | 'INVALID_DISCARD_ORDER'
  | 'INVALID_DRAW_SOURCE'
  | 'DRAW_CARD_NOT_AVAILABLE'
  | 'DRAW_PILE_UNAVAILABLE'
  | 'YANIV_VALUE_TOO_HIGH'
  | 'ROUND_NOT_OVER'
  | 'PLAYER_ALREADY_READY'
  | 'PLAYER_NOT_DISCONNECTED'
  | 'DISCONNECT_GRACE_NOT_REACHED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'ACTION_RATE_LIMITED'
  | 'INTERNAL_ERROR'

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly recoverable: boolean

  constructor(code: DomainErrorCode, message: string, recoverable = true) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.recoverable = recoverable
  }
}
