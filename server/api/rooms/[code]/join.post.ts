import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { joinRoomRequestSchema } from '../../../../shared/protocol/client-messages'
import { DomainError } from '../../../../shared/game/errors'
import { joinRoom } from '../../../services/room-service'
import { enforceRateLimit } from '../../../utils/rate-limit'
import { clientIdentity, toHttpError } from '../../../utils/http-errors'
import { isValidRoomCode, normalizeRoomCode } from '../../../utils/room-code'
import { logEvent } from '../../../utils/log'

export default defineEventHandler(async (event) => {
  try {
    await enforceRateLimit('join', clientIdentity(event), 20, 60)
    const code = normalizeRoomCode(getRouterParam(event, 'code') ?? '')
    if (!isValidRoomCode(code)) {
      throw new DomainError('ROOM_NOT_FOUND', 'This room does not exist or has expired.')
    }
    const body = joinRoomRequestSchema.safeParse(await readBody(event))
    if (!body.success) {
      throw new DomainError('INVALID_PAYLOAD', 'A display name is required.')
    }
    const credentials = await joinRoom(code, body.data.displayName)
    logEvent('player_joined', { roomCode: code, playerId: credentials.playerId })
    return credentials
  }
  catch (error) {
    throw toHttpError(error)
  }
})
