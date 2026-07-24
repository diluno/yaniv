import type { GameState, RoomPlayer, RoomState } from '../types/room'
import type { GameAction, PlayTurnAction } from '../protocol/actions'
import { GAME_CONFIG, DISCONNECT_REMOVE_GRACE_MS } from './constants'
import { DomainError } from './errors'
import { cardsByIds } from './deck'
import { createDeck, shuffleDeck } from './deck'
import { handValue } from './cards'
import { classifyDiscard } from './discard-validation'
import { resolveRound } from './scoring'
import type { RandomSource } from './random'

export interface ActionContext {
  now: Date
  random: RandomSource
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function activePlayers(state: RoomState): RoomPlayer[] {
  return state.players.filter(p => !p.eliminated && p.connectionStatus !== 'left')
}

function requirePlayer(state: RoomState, playerId: string): RoomPlayer {
  const player = state.players.find(p => p.id === playerId)
  if (!player || player.connectionStatus === 'left') {
    throw new DomainError('NOT_A_PLAYER', 'You are not a player in this room.')
  }
  return player
}

function requireGame(state: RoomState): GameState {
  if (!state.game) throw new DomainError('ROOM_NOT_PLAYING', 'The match has not started.')
  return state.game
}

function nextActiveSeatAfter(state: RoomState, playerId: string): RoomPlayer {
  const seated = [...state.players].sort((a, b) => a.seat - b.seat)
  const idx = seated.findIndex(p => p.id === playerId)
  for (let offset = 1; offset <= seated.length; offset++) {
    const candidate = seated[(idx + offset) % seated.length]!
    if (!candidate.eliminated && candidate.connectionStatus !== 'left') return candidate
  }
  throw new DomainError('INTERNAL_ERROR', 'No active player found.', false)
}

function previousActiveSeatBefore(state: RoomState, playerId: string): RoomPlayer {
  const seated = [...state.players].sort((a, b) => a.seat - b.seat)
  const idx = seated.findIndex(p => p.id === playerId)
  for (let offset = 1; offset <= seated.length; offset++) {
    const candidate = seated[(idx - offset + seated.length) % seated.length]!
    if (!candidate.eliminated && candidate.connectionStatus !== 'left') return candidate
  }
  throw new DomainError('INTERNAL_ERROR', 'No active player found.', false)
}

/** Deal a fresh round. Collects all cards, shuffles, deals, flips one card. */
export function dealRound(
  state: RoomState,
  starterId: string,
  dealerId: string,
  roundNumber: number,
  random: RandomSource,
): void {
  const deck = shuffleDeck(createDeck(), random)
  const active = activePlayers(state)
  for (const player of state.players) {
    player.hand = []
    player.readyForNextRound = false
  }
  for (const player of active) {
    player.hand = deck.splice(0, GAME_CONFIG.startingHandSize).map(c => c.id)
  }
  const flipped = deck.shift()!
  state.game = {
    roundNumber,
    dealerPlayerId: dealerId,
    startingPlayerId: starterId,
    currentTurnPlayerId: starterId,
    phase: 'awaiting_turn',
    drawPile: deck.map(c => c.id),
    discardHistory: [],
    lastDiscardPacket: [flipped.id],
    roundResult: null,
    winnerPlayerId: null,
  }
}

function applyStartMatch(state: RoomState, actorId: string, ctx: ActionContext): void {
  if (state.status !== 'lobby') {
    throw new DomainError('ROOM_ALREADY_STARTED', 'The match has already started.')
  }
  if (actorId !== state.hostPlayerId) {
    throw new DomainError('NOT_HOST', 'Only the host can start the match.')
  }
  const connected = state.players.filter(p => p.connectionStatus === 'connected')
  if (connected.length < GAME_CONFIG.minPlayers) {
    throw new DomainError('NOT_ENOUGH_PLAYERS', 'At least two connected players are needed.')
  }

  // Drop players who never connected or already left, then compact seats.
  state.players = state.players.filter(p => p.connectionStatus === 'connected')
  state.players.sort((a, b) => a.seat - b.seat).forEach((p, i) => { p.seat = i })

  const starter = state.players[ctx.random.nextInt(state.players.length)]!
  const dealer = previousActiveSeatBefore(state, starter.id)
  state.status = 'playing'
  dealRound(state, starter.id, dealer.id, 1, ctx.random)
}

function applyPlayTurn(state: RoomState, actorId: string, action: PlayTurnAction, ctx: ActionContext): void {
  const game = requireGame(state)
  if (state.status === 'paused') throw new DomainError('ROOM_PAUSED', 'The game is paused.')
  if (state.status !== 'playing') throw new DomainError('ROOM_NOT_PLAYING', 'The game is not active.')
  if (game.phase !== 'awaiting_turn') throw new DomainError('ROOM_NOT_PLAYING', 'The round is over.')
  const player = requirePlayer(state, actorId)
  if (player.eliminated) throw new DomainError('PLAYER_ELIMINATED', 'You have been eliminated.')
  if (game.currentTurnPlayerId !== actorId) {
    throw new DomainError('NOT_YOUR_TURN', 'It is not your turn.')
  }

  const { discardCardIds, draw } = action
  if (discardCardIds.length === 0) {
    throw new DomainError('INVALID_DISCARD', 'You must discard at least one card.')
  }
  if (new Set(discardCardIds).size !== discardCardIds.length) {
    throw new DomainError('DUPLICATE_CARD_ID', 'Duplicate cards in discard.')
  }
  for (const id of discardCardIds) {
    if (!player.hand.includes(id)) {
      throw new DomainError('CARD_NOT_IN_HAND', 'You can only discard cards from your hand.')
    }
  }

  const discardCards = cardsByIds(discardCardIds)
  const classification = classifyDiscard(discardCards)
  if (classification.kind === 'invalid') {
    const isOrderIssue = discardCards.length >= 3
    throw new DomainError(
      isOrderIssue ? 'INVALID_DISCARD_ORDER' : 'INVALID_DISCARD',
      classification.reason,
    )
  }

  // Resolve draw against the packet as it existed before this discard.
  const previousPacket = game.lastDiscardPacket
  let drawnCardId: string
  if (draw.source === 'deck') {
    if (game.drawPile.length === 0) {
      // Rebuild from discard history, keeping the current packet available.
      if (game.discardHistory.length === 0) {
        throw new DomainError('DRAW_PILE_UNAVAILABLE', 'No cards are available to draw.')
      }
      const rebuilt = shuffleDeck(cardsByIds(game.discardHistory), ctx.random)
      game.drawPile = rebuilt.map(c => c.id)
      game.discardHistory = []
    }
    drawnCardId = game.drawPile.shift()!
  }
  else {
    const first = previousPacket[0]
    const last = previousPacket[previousPacket.length - 1]
    if (draw.cardId !== first && draw.cardId !== last) {
      throw new DomainError('DRAW_CARD_NOT_AVAILABLE', 'Only the first or last card of the previous play can be taken.')
    }
    drawnCardId = draw.cardId
  }

  // Commit atomically: remove discards, move old packet remainder to history.
  player.hand = player.hand.filter(id => !discardCardIds.includes(id))
  player.hand.push(drawnCardId)
  const unclaimed = previousPacket.filter(id => id !== drawnCardId || draw.source === 'deck')
  game.discardHistory.push(...(draw.source === 'deck' ? previousPacket : unclaimed))
  game.lastDiscardPacket = [...discardCardIds]
  game.currentTurnPlayerId = nextActiveSeatAfter(state, actorId).id
}

function applyCallYaniv(state: RoomState, actorId: string): void {
  const game = requireGame(state)
  if (state.status === 'paused') throw new DomainError('ROOM_PAUSED', 'The game is paused.')
  if (state.status !== 'playing') throw new DomainError('ROOM_NOT_PLAYING', 'The game is not active.')
  if (game.phase !== 'awaiting_turn') throw new DomainError('ROOM_NOT_PLAYING', 'The round is over.')
  const player = requirePlayer(state, actorId)
  if (player.eliminated) throw new DomainError('PLAYER_ELIMINATED', 'You have been eliminated.')
  if (game.currentTurnPlayerId !== actorId) {
    throw new DomainError('NOT_YOUR_TURN', 'It is not your turn.')
  }
  const value = handValue(cardsByIds(player.hand))
  if (value > GAME_CONFIG.yanivThreshold) {
    throw new DomainError('YANIV_VALUE_TOO_HIGH', `You need ${GAME_CONFIG.yanivThreshold} points or fewer to call Yaniv.`)
  }

  const result = resolveRound(
    activePlayers(state).map(p => ({ id: p.id, hand: p.hand, score: p.score })),
    actorId,
  )

  for (const entry of result.entries) {
    const p = state.players.find(pl => pl.id === entry.playerId)!
    p.score = entry.scoreAfter
    p.eliminated = entry.eliminated
    p.hand = []
  }

  game.currentTurnPlayerId = null
  game.roundResult = result

  const remaining = activePlayers(state)
  if (remaining.length <= 1) {
    game.phase = 'match_over'
    game.winnerPlayerId = remaining[0]?.id ?? null
    state.status = 'finished'
  }
  else {
    game.phase = 'round_over'
  }
}

function applyReadyNextRound(state: RoomState, actorId: string, ctx: ActionContext): void {
  const game = requireGame(state)
  if (game.phase !== 'round_over') {
    throw new DomainError('ROUND_NOT_OVER', 'The round is still in progress.')
  }
  const player = requirePlayer(state, actorId)
  if (player.eliminated) throw new DomainError('PLAYER_ELIMINATED', 'You have been eliminated.')
  if (player.readyForNextRound) {
    throw new DomainError('PLAYER_ALREADY_READY', 'You are already ready.')
  }
  player.readyForNextRound = true

  const active = activePlayers(state)
  const allReady = active
    .filter(p => p.connectionStatus === 'connected')
    .every(p => p.readyForNextRound)
  const anyDisconnected = active.some(p => p.connectionStatus !== 'connected')
  if (allReady && !anyDisconnected) {
    const starterId = game.roundResult?.nextStarterPlayerId ?? active[0]!.id
    const dealer = nextActiveSeatAfter(state, game.dealerPlayerId)
    dealRound(state, starterId, dealer.id, game.roundNumber + 1, ctx.random)
  }
}

function applyRemoveDisconnected(
  state: RoomState,
  actorId: string,
  targetPlayerId: string,
  ctx: ActionContext,
): void {
  if (actorId !== state.hostPlayerId) {
    throw new DomainError('NOT_HOST', 'Only the host can remove a player.')
  }
  const game = requireGame(state)
  const target = state.players.find(p => p.id === targetPlayerId)
  if (!target || target.connectionStatus !== 'disconnected') {
    throw new DomainError('PLAYER_NOT_DISCONNECTED', 'That player is not disconnected.')
  }
  const disconnectedAt = target.disconnectedAt ? Date.parse(target.disconnectedAt) : NaN
  if (Number.isNaN(disconnectedAt) || ctx.now.getTime() - disconnectedAt < DISCONNECT_REMOVE_GRACE_MS) {
    throw new DomainError('DISCONNECT_GRACE_NOT_REACHED', 'Wait two minutes before removing a disconnected player.')
  }

  target.connectionStatus = 'left'
  target.hand = []

  const remaining = activePlayers(state)
  if (remaining.length < GAME_CONFIG.minPlayers) {
    state.status = 'finished'
    game.phase = 'match_over'
    game.currentTurnPlayerId = null
    game.winnerPlayerId = null
    return
  }

  // Abort only the current round; completed-round scores stay.
  const starter = remaining[ctx.random.nextInt(remaining.length)]!
  const dealer = nextActiveSeatAfter(state, game.dealerPlayerId)
  state.status = 'playing'
  dealRound(state, starter.id, dealer.id, game.roundNumber + 1, ctx.random)
}

function applyLeaveRoom(state: RoomState, actorId: string, ctx: ActionContext): void {
  const player = requirePlayer(state, actorId)
  player.connectionStatus = 'left'
  player.hand = []
  player.disconnectedAt = ctx.now.toISOString()

  if (state.status === 'lobby') {
    state.players = state.players.filter(p => p.id !== actorId)
    state.players.sort((a, b) => a.seat - b.seat).forEach((p, i) => { p.seat = i })
    if (state.hostPlayerId === actorId && state.players.length > 0) {
      state.hostPlayerId = state.players[0]!.id
    }
    return
  }

  if (state.hostPlayerId === actorId) {
    const successor = state.players.find(
      p => p.id !== actorId && p.connectionStatus === 'connected' && !p.eliminated,
    ) ?? state.players.find(p => p.id !== actorId && p.connectionStatus !== 'left')
    if (successor) state.hostPlayerId = successor.id
  }

  const remaining = activePlayers(state)
  if (state.status !== 'finished' && remaining.length < GAME_CONFIG.minPlayers) {
    state.status = 'finished'
    if (state.game) {
      state.game.phase = 'match_over'
      state.game.currentTurnPlayerId = null
      state.game.winnerPlayerId = null
    }
    return
  }

  if (state.game && state.game.phase === 'awaiting_turn') {
    // Restart the round without the leaver so no hand is half-played.
    const starter = remaining[ctx.random.nextInt(remaining.length)]!
    const dealer = nextActiveSeatAfter(state, state.game.dealerPlayerId)
    state.status = 'playing'
    dealRound(state, starter.id, dealer.id, state.game.roundNumber + 1, ctx.random)
  }
}

function applyEndRoom(state: RoomState, actorId: string): void {
  if (actorId !== state.hostPlayerId) {
    throw new DomainError('NOT_HOST', 'Only the host can end the room.')
  }
  state.status = 'finished'
  if (state.game) {
    state.game.phase = 'match_over'
    state.game.currentTurnPlayerId = null
  }
}

/** Pure reducer: returns the next room state or throws a DomainError. */
export function applyAction(
  previous: RoomState,
  actorId: string,
  action: GameAction,
  ctx: ActionContext,
): RoomState {
  const state = clone(previous)

  switch (action.type) {
    case 'start_match':
      applyStartMatch(state, actorId, ctx)
      break
    case 'play_turn':
      applyPlayTurn(state, actorId, action, ctx)
      break
    case 'call_yaniv':
      applyCallYaniv(state, actorId)
      break
    case 'ready_next_round':
      applyReadyNextRound(state, actorId, ctx)
      break
    case 'remove_disconnected_and_restart_round':
      applyRemoveDisconnected(state, actorId, action.playerId, ctx)
      break
    case 'leave_room':
      applyLeaveRoom(state, actorId, ctx)
      break
    case 'end_room':
      applyEndRoom(state, actorId)
      break
    default:
      throw new DomainError('INVALID_PAYLOAD', 'Unknown action type.')
  }

  state.version = previous.version + 1
  state.updatedAt = ctx.now.toISOString()
  return state
}
