import type { ClientRoomSnapshot, ClientRoundResult, RoomState } from '../types/room'
import { GAME_CONFIG, DISCONNECT_REMOVE_GRACE_MS } from './constants'
import { cardsByIds } from './deck'
import { handValue } from './cards'

/** Build the private, per-player view of the room. Never leaks other hands. */
export function projectRoomForPlayer(state: RoomState, playerId: string): ClientRoomSnapshot {
  const self = state.players.find(p => p.id === playerId)
  if (!self) throw new Error('Player not in room')

  const game = state.game
  let clientGame: ClientRoomSnapshot['game'] = null

  if (game) {
    const ownHand = cardsByIds(self.hand)
    const roundOver = game.phase !== 'awaiting_turn'
    const roundResult: ClientRoundResult | null = roundOver && game.roundResult
      ? {
          ...game.roundResult,
          entries: game.roundResult.entries.map(e => ({ ...e, hand: cardsByIds(e.hand) })),
        }
      : null

    const isOwnTurn = state.status === 'playing'
      && game.phase === 'awaiting_turn'
      && game.currentTurnPlayerId === playerId

    const packet = game.lastDiscardPacket
    const legalDrawCardIds = isOwnTurn && packet.length > 0
      ? [...new Set([packet[0]!, packet[packet.length - 1]!])]
      : []

    clientGame = {
      roundNumber: game.roundNumber,
      dealerPlayerId: game.dealerPlayerId,
      startingPlayerId: game.startingPlayerId,
      currentTurnPlayerId: game.currentTurnPlayerId,
      phase: game.phase,
      ownHand,
      ownHandValue: handValue(ownHand),
      drawPileCount: game.drawPile.length,
      lastDiscardPacket: cardsByIds(game.lastDiscardPacket),
      canCallYaniv: isOwnTurn && handValue(ownHand) <= GAME_CONFIG.yanivThreshold,
      legalDrawCardIds,
      roundResult,
      winnerPlayerId: game.winnerPlayerId,
    }
  }

  const missing = state.players.filter(
    p => p.connectionStatus === 'disconnected' && !p.eliminated,
  )
  const now = Date.parse(state.updatedAt)
  const disconnectRecovery = state.status === 'paused' && missing.length > 0
    ? {
        missingPlayerIds: missing.map(p => p.id),
        hostCanRestartWithoutMissingPlayers: missing.some((p) => {
          const since = p.disconnectedAt ? Date.parse(p.disconnectedAt) : NaN
          return !Number.isNaN(since) && now - since >= DISCONNECT_REMOVE_GRACE_MS
        }),
      }
    : null

  return {
    schemaVersion: 1,
    roomCode: state.code,
    status: state.status,
    version: state.version,
    hostPlayerId: state.hostPlayerId,
    selfPlayerId: playerId,
    players: state.players
      .filter(p => p.connectionStatus !== 'left')
      .map(p => ({
        id: p.id,
        displayName: p.displayName,
        seat: p.seat,
        connectionStatus: p.connectionStatus,
        score: p.score,
        eliminated: p.eliminated,
        handCount: p.hand.length,
        readyForNextRound: p.readyForNextRound,
      })),
    game: clientGame,
    disconnectRecovery,
  }
}
