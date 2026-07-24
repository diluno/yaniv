import { defineEventHandler, readBody } from 'h3'
import { createRoomRequestSchema } from '../../../shared/protocol/client-messages'
import { DomainError } from '../../../shared/game/errors'
import { createRoom } from '../../services/room-service'
import { enforceRateLimit } from '../../utils/rate-limit'
import { clientIdentity, toHttpError } from '../../utils/http-errors'
import { logEvent } from '../../utils/log'

export default defineEventHandler(async (event) => {
  try {
    await enforceRateLimit('create', clientIdentity(event), 30, 60)
    const body = createRoomRequestSchema.safeParse(await readBody(event))
    if (!body.success) {
      throw new DomainError('INVALID_PAYLOAD', 'A display name is required.')
    }
    const credentials = await createRoom(body.data.displayName)
    logEvent('room_created', { roomCode: credentials.roomCode })
    return credentials
  }
  catch (error) {
    throw toHttpError(error)
  }
})
