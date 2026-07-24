import type { ClientRoomSnapshot } from '../types/room'
import type { DomainErrorCode } from '../game/errors'

export type ServerMessage =
  | { type: 'authenticated', snapshot: ClientRoomSnapshot }
  | { type: 'snapshot', snapshot: ClientRoomSnapshot }
  | { type: 'action_ack', actionId: string, version: number }
  | {
    type: 'error'
    code: DomainErrorCode
    message: string
    actionId?: string
    recoverable: boolean
    snapshot?: ClientRoomSnapshot
  }
  | { type: 'pong', sentAt: number, serverAt: number }
