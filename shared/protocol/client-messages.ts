import { z } from 'zod'

export const displayNameSchema = z.string().min(1).max(60)

export const roomCodeSchema = z.string().min(4).max(12)

export const playTurnActionSchema = z.object({
  type: z.literal('play_turn'),
  discardCardIds: z.array(z.string().max(20)).min(1).max(14),
  draw: z.discriminatedUnion('source', [
    z.object({ source: z.literal('deck') }),
    z.object({ source: z.literal('previous_discard'), cardId: z.string().max(20) }),
  ]),
})

export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_match') }),
  playTurnActionSchema,
  z.object({ type: z.literal('call_yaniv') }),
  z.object({ type: z.literal('ready_next_round') }),
  z.object({
    type: z.literal('remove_disconnected_and_restart_round'),
    playerId: z.string().max(64),
  }),
  z.object({ type: z.literal('leave_room') }),
  z.object({ type: z.literal('end_room') }),
])

export const createRoomRequestSchema = z.object({
  displayName: displayNameSchema,
})

export const joinRoomRequestSchema = z.object({
  displayName: displayNameSchema,
})

export const authenticateMessageSchema = z.object({
  type: z.literal('authenticate'),
  roomCode: roomCodeSchema,
  playerToken: z.string().min(16).max(128),
  clientInstanceId: z.string().max(64),
  lastKnownVersion: z.number().int().nonnegative().optional(),
})

export const heartbeatMessageSchema = z.object({
  type: z.literal('heartbeat'),
  sentAt: z.number(),
})

export const actionMessageSchema = z.object({
  type: z.literal('action'),
  actionId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative().optional(),
  action: gameActionSchema,
})

export const clientMessageSchema = z.discriminatedUnion('type', [
  authenticateMessageSchema,
  heartbeatMessageSchema,
  actionMessageSchema,
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type AuthenticateMessage = z.infer<typeof authenticateMessageSchema>
export type ActionMessage = z.infer<typeof actionMessageSchema>

export const MAX_WS_MESSAGE_BYTES = 16 * 1024
