import type { RoomState } from '../types/room'
import { GAME_CONFIG } from './constants'

export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`Invariant violation: ${message}`)
    this.name = 'InvariantViolation'
  }
}

function fail(message: string): never {
  throw new InvariantViolation(message)
}

export function assertRoomInvariants(state: RoomState): void {
  const active = state.players.filter(p => !p.eliminated && p.connectionStatus !== 'left')

  for (const p of state.players) {
    if (!Number.isInteger(p.score) || p.score < 0) fail(`score of ${p.id} is ${p.score}`)
    if (!p.eliminated && p.score > GAME_CONFIG.eliminationScore) {
      fail(`non-eliminated ${p.id} has score ${p.score}`)
    }
    if (new Set(p.hand).size !== p.hand.length) fail(`duplicate cards in hand of ${p.id}`)
    if ((p.eliminated || p.connectionStatus === 'left') && p.hand.length > 0) {
      fail(`inactive player ${p.id} holds cards`)
    }
  }

  const game = state.game
  if (game && game.phase === 'awaiting_turn') {
    const seen = new Set<string>()
    const locations: Array<[string, string[]]> = [
      ['drawPile', game.drawPile],
      ['discardHistory', game.discardHistory],
      ['lastDiscardPacket', game.lastDiscardPacket],
      ...state.players.map(p => [`hand:${p.id}`, p.hand] as [string, string[]]),
    ]
    let total = 0
    for (const [where, ids] of locations) {
      for (const id of ids) {
        if (seen.has(id)) fail(`card ${id} appears twice (${where})`)
        seen.add(id)
        total++
      }
    }
    if (total !== GAME_CONFIG.deckSize) fail(`card count is ${total}, expected ${GAME_CONFIG.deckSize}`)

    const turnPlayer = state.players.find(p => p.id === game.currentTurnPlayerId)
    if (!turnPlayer) fail('no current turn player during awaiting_turn')
    if (turnPlayer!.eliminated || turnPlayer!.connectionStatus === 'left') {
      fail('current turn player is not active')
    }
    if (state.status === 'playing' && active.length < GAME_CONFIG.minPlayers) {
      fail('fewer than two active players while playing')
    }
  }

  if (game && game.phase !== 'awaiting_turn' && game.currentTurnPlayerId !== null) {
    fail('round-over state still has a current turn')
  }

  if (state.status === 'finished' && game && game.phase === 'match_over') {
    // winnerPlayerId may be null only for abandoned matches; both are allowed.
  }
}
