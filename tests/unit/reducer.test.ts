import { describe, expect, it } from 'vitest'
import type { RoomState } from '../../shared/types/room'
import { applyAction } from '../../shared/game/reducer'
import { createLobbyRoom, createPlayer } from '../../shared/game/room-factory'
import { createSeededRandom } from '../../shared/game/random'
import { assertRoomInvariants } from '../../shared/game/invariants'
import { projectRoomForPlayer } from '../../shared/game/projection'
import { cardById, cardsByIds } from '../../shared/game/deck'
import { handValue } from '../../shared/game/cards'
import { DomainError } from '../../shared/game/errors'

const NOW = new Date('2026-07-24T12:00:00Z')
const ctx = (seed = 1) => ({ now: NOW, random: createSeededRandom(seed) })

function lobbyRoom(playerCount = 3): RoomState {
  const room = createLobbyRoom({
    code: 'TEST42',
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 3600_000),
    host: { id: 'p0', tokenHash: 'h0', displayName: 'Host' },
  })
  for (let i = 1; i < playerCount; i++) {
    room.players.push(createPlayer({ id: `p${i}`, tokenHash: `h${i}`, displayName: `Player ${i}` }, i))
  }
  for (const p of room.players) p.connectionStatus = 'connected'
  return room
}

function startedRoom(playerCount = 3, seed = 1): RoomState {
  return applyAction(lobbyRoom(playerCount), 'p0', { type: 'start_match' }, ctx(seed))
}

function currentPlayer(state: RoomState) {
  return state.players.find(p => p.id === state.game!.currentTurnPlayerId)!
}

describe('start_match', () => {
  it('requires the host', () => {
    expect(() => applyAction(lobbyRoom(), 'p1', { type: 'start_match' }, ctx()))
      .toThrowError(/host/i)
  })

  it('requires at least two connected players', () => {
    const room = lobbyRoom(2)
    room.players[1]!.connectionStatus = 'disconnected'
    expect(() => applyAction(room, 'p0', { type: 'start_match' }, ctx()))
      .toThrow(DomainError)
  })

  it('deals five cards each plus one face-up card and satisfies invariants', () => {
    const state = startedRoom(4)
    expect(state.status).toBe('playing')
    for (const p of state.players) expect(p.hand).toHaveLength(5)
    expect(state.game!.lastDiscardPacket).toHaveLength(1)
    expect(state.game!.drawPile).toHaveLength(54 - 4 * 5 - 1)
    assertRoomInvariants(state)
  })

  it('cannot start twice', () => {
    expect(() => applyAction(startedRoom(), 'p0', { type: 'start_match' }, ctx()))
      .toThrowError(/already started/i)
  })
})

describe('play_turn', () => {
  it('plays a legal single with a deck draw and advances the turn', () => {
    const state = startedRoom()
    const actor = currentPlayer(state)
    const discard = actor.hand[0]!
    const next = applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [discard],
      draw: { source: 'deck' },
    }, ctx())
    const nextActor = next.players.find(p => p.id === actor.id)!
    expect(nextActor.hand).toHaveLength(5)
    expect(nextActor.hand).not.toContain(discard)
    expect(next.game!.lastDiscardPacket).toEqual([discard])
    expect(next.game!.currentTurnPlayerId).not.toBe(actor.id)
    expect(next.version).toBe(state.version + 1)
    assertRoomInvariants(next)
  })

  it('draws the previous discard card (single packet: first === last)', () => {
    const state = startedRoom()
    const actor = currentPlayer(state)
    const target = state.game!.lastDiscardPacket[0]!
    const next = applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [actor.hand[0]!],
      draw: { source: 'previous_discard', cardId: target },
    }, ctx())
    expect(next.players.find(p => p.id === actor.id)!.hand).toContain(target)
    expect(next.game!.discardHistory).not.toContain(target)
    assertRoomInvariants(next)
  })

  it('allows drawing first and last endpoints of a multi-card packet but not the middle', () => {
    const state = startedRoom()
    const game = state.game!
    const actor = currentPlayer(state)
    // Force a known three-card packet.
    const packet = ['hearts-3', 'hearts-4', 'hearts-5']
    // Remove those cards from wherever they are and rebuild a consistent state.
    const owned = new Set(packet)
    for (const p of state.players) p.hand = p.hand.filter(id => !owned.has(id))
    game.drawPile = game.drawPile.filter(id => !owned.has(id))
    game.discardHistory.push(...game.lastDiscardPacket)
    game.lastDiscardPacket = packet
    // Top up hands back to 5 from the draw pile.
    for (const p of state.players) {
      while (p.hand.length < 5) p.hand.push(game.drawPile.shift()!)
    }
    assertRoomInvariants(state)

    for (const [cardId, ok] of [['hearts-3', true], ['hearts-5', true], ['hearts-4', false]] as const) {
      const attempt = () => applyAction(state, actor.id, {
        type: 'play_turn',
        discardCardIds: [actor.hand[0]!],
        draw: { source: 'previous_discard', cardId },
      }, ctx())
      if (ok) {
        const next = attempt()
        expect(next.players.find(p => p.id === actor.id)!.hand).toContain(cardId)
        assertRoomInvariants(next)
      }
      else {
        expect(attempt).toThrowError(/first or last/i)
      }
    }
  })

  it('rejects discarding a card not in hand', () => {
    const state = startedRoom()
    const actor = currentPlayer(state)
    const foreign = state.game!.drawPile[0]!
    expect(() => applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [foreign],
      draw: { source: 'deck' },
    }, ctx())).toThrowError(/from your hand/i)
  })

  it('rejects acting out of turn', () => {
    const state = startedRoom()
    const other = state.players.find(p => p.id !== state.game!.currentTurnPlayerId)!
    expect(() => applyAction(state, other.id, {
      type: 'play_turn',
      discardCardIds: [other.hand[0]!],
      draw: { source: 'deck' },
    }, ctx())).toThrowError(/not your turn/i)
  })

  it('rejects gameplay while paused', () => {
    const state = startedRoom()
    state.status = 'paused'
    const actor = currentPlayer(state)
    expect(() => applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [actor.hand[0]!],
      draw: { source: 'deck' },
    }, ctx())).toThrowError(/paused/i)
  })

  it('rebuilds the draw pile from discard history when empty', () => {
    const state = startedRoom()
    const game = state.game!
    // Move the entire draw pile into discard history.
    game.discardHistory.push(...game.drawPile)
    game.drawPile = []
    assertRoomInvariants(state)
    const actor = currentPlayer(state)
    const next = applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [actor.hand[0]!],
      draw: { source: 'deck' },
    }, ctx())
    expect(next.players.find(p => p.id === actor.id)!.hand).toHaveLength(5)
    // Old packet went to history after the rebuild consumed it.
    assertRoomInvariants(next)
  })

  it('skips eliminated players in turn order', () => {
    const state = startedRoom(3)
    const order = [...state.players].sort((a, b) => a.seat - b.seat)
    const actor = currentPlayer(state)
    const actorSeatIdx = order.findIndex(p => p.id === actor.id)
    const skipped = order[(actorSeatIdx + 1) % order.length]!
    skipped.eliminated = true
    state.game!.drawPile.push(...skipped.hand)
    skipped.hand = []
    const next = applyAction(state, actor.id, {
      type: 'play_turn',
      discardCardIds: [actor.hand[0]!],
      draw: { source: 'deck' },
    }, ctx())
    const expected = order[(actorSeatIdx + 2) % order.length]!
    expect(next.game!.currentTurnPlayerId).toBe(expected.id)
  })
})

describe('call_yaniv', () => {
  function riggedRoom(callerHand: string[], opponentHands: string[][]) {
    const state = startedRoom(opponentHands.length + 1)
    const game = state.game!
    const order = [...state.players].sort((a, b) => a.seat - b.seat)
    const caller = currentPlayer(state)
    const opponents = order.filter(p => p.id !== caller.id)
    // Reassign hands deterministically, dumping everything else into the pile.
    const all = [...caller.hand, ...opponents.flatMap(p => p.hand), ...game.drawPile, ...game.discardHistory, ...game.lastDiscardPacket]
    const wanted = new Set([...callerHand, ...opponentHands.flat()])
    caller.hand = callerHand
    opponents.forEach((p, i) => { p.hand = opponentHands[i]! })
    game.discardHistory = []
    game.drawPile = all.filter(id => !wanted.has(id))
    game.lastDiscardPacket = [game.drawPile.shift()!]
    assertRoomInvariants(state)
    return { state, caller, opponents }
  }

  it('rejects calling above 5 points', () => {
    const { state, caller } = riggedRoom(['hearts-6'], [['spades-K'], ['clubs-K']])
    expect(() => applyAction(state, caller.id, { type: 'call_yaniv' }, ctx()))
      .toThrowError(/5 points or fewer/i)
  })

  it('resolves a successful yaniv and moves to round_over', () => {
    const { state, caller } = riggedRoom(['hearts-3'], [['spades-K'], ['clubs-K', 'clubs-Q']])
    const next = applyAction(state, caller.id, { type: 'call_yaniv' }, ctx())
    expect(next.game!.phase).toBe('round_over')
    expect(next.game!.roundResult!.outcome).toBe('yaniv')
    expect(next.game!.currentTurnPlayerId).toBeNull()
    expect(next.players.find(p => p.id === caller.id)!.score).toBe(0)
    assertRoomInvariants(next)
  })

  it('applies assaf penalty and finishes the match when one player remains', () => {
    const { state, caller, opponents } = riggedRoom(['hearts-5'], [['spades-2']])
    state.players.find(p => p.id === caller.id)!.score = 70
    const next = applyAction(state, caller.id, { type: 'call_yaniv' }, ctx())
    // caller: 70 + 5 + 30 = 105 → eliminated; opponent remains → match over
    expect(next.players.find(p => p.id === caller.id)!.eliminated).toBe(true)
    expect(next.status).toBe('finished')
    expect(next.game!.phase).toBe('match_over')
    expect(next.game!.winnerPlayerId).toBe(opponents[0]!.id)
  })
})

describe('ready_next_round', () => {
  it('deals the next round when all active players are ready', () => {
    const state = startedRoom(2)
    const game = state.game!
    const caller = currentPlayer(state)
    // Rig a successful yaniv.
    const opponent = state.players.find(p => p.id !== caller.id)!
    const all = [...caller.hand, ...opponent.hand, ...game.drawPile, ...game.discardHistory, ...game.lastDiscardPacket]
    caller.hand = ['hearts-2']
    opponent.hand = ['spades-K']
    game.discardHistory = []
    game.drawPile = all.filter(id => id !== 'hearts-2' && id !== 'spades-K')
    game.lastDiscardPacket = [game.drawPile.shift()!]

    let next = applyAction(state, caller.id, { type: 'call_yaniv' }, ctx())
    expect(next.game!.phase).toBe('round_over')
    next = applyAction(next, caller.id, { type: 'ready_next_round' }, ctx())
    expect(next.game!.phase).toBe('round_over')
    next = applyAction(next, opponent.id, { type: 'ready_next_round' }, ctx(7))
    expect(next.game!.phase).toBe('awaiting_turn')
    expect(next.game!.roundNumber).toBe(2)
    expect(next.game!.startingPlayerId).toBe(caller.id)
    for (const p of next.players) expect(p.hand).toHaveLength(5)
    assertRoomInvariants(next)
  })

  it('rejects ready when the round is running', () => {
    const state = startedRoom()
    expect(() => applyAction(state, 'p0', { type: 'ready_next_round' }, ctx()))
      .toThrowError(/in progress/i)
  })
})

describe('remove_disconnected_and_restart_round', () => {
  it('enforces host, disconnect state, and the two-minute grace period', () => {
    const state = startedRoom(3)
    const target = state.players.find(p => p.id !== 'p0')!
    expect(() => applyAction(state, 'p1', { type: 'remove_disconnected_and_restart_round', playerId: target.id }, ctx()))
      .toThrowError(/host/i)
    expect(() => applyAction(state, 'p0', { type: 'remove_disconnected_and_restart_round', playerId: target.id }, ctx()))
      .toThrowError(/not disconnected/i)

    target.connectionStatus = 'disconnected'
    target.disconnectedAt = new Date(NOW.getTime() - 60_000).toISOString()
    state.status = 'paused'
    expect(() => applyAction(state, 'p0', { type: 'remove_disconnected_and_restart_round', playerId: target.id }, ctx()))
      .toThrowError(/two minutes/i)
  })

  it('removes the player, keeps scores, and restarts the round', () => {
    const state = startedRoom(3)
    for (const p of state.players) p.score = 20
    const target = state.players.find(p => p.id !== 'p0')!
    target.connectionStatus = 'disconnected'
    target.disconnectedAt = new Date(NOW.getTime() - 180_000).toISOString()
    state.status = 'paused'

    const next = applyAction(state, 'p0', { type: 'remove_disconnected_and_restart_round', playerId: target.id }, ctx())
    expect(next.status).toBe('playing')
    expect(next.players.find(p => p.id === target.id)!.connectionStatus).toBe('left')
    for (const p of next.players) expect(p.score).toBe(20)
    const remaining = next.players.filter(p => p.connectionStatus !== 'left')
    for (const p of remaining) expect(p.hand).toHaveLength(5)
    assertRoomInvariants(next)
  })

  it('ends the match when fewer than two players would remain', () => {
    const state = startedRoom(2)
    const target = state.players.find(p => p.id !== 'p0')!
    target.connectionStatus = 'disconnected'
    target.disconnectedAt = new Date(NOW.getTime() - 180_000).toISOString()
    state.status = 'paused'
    const next = applyAction(state, 'p0', { type: 'remove_disconnected_and_restart_round', playerId: target.id }, ctx())
    expect(next.status).toBe('finished')
    expect(next.game!.winnerPlayerId).toBeNull()
  })
})

describe('projection privacy', () => {
  it('never exposes another player’s hand or any token hash', () => {
    const state = startedRoom(3)
    for (const viewer of state.players) {
      const snapshot = projectRoomForPlayer(state, viewer.id)
      const json = JSON.stringify(snapshot)
      expect(json).not.toContain('tokenHash')
      expect(json).not.toContain('h0')
      for (const other of state.players.filter(p => p.id !== viewer.id)) {
        for (const cardId of other.hand) {
          // A card may legitimately appear in the shared discard packet.
          if (!state.game!.lastDiscardPacket.includes(cardId)) {
            expect(json).not.toContain(`"${cardId}"`)
          }
        }
      }
      expect(snapshot.game!.ownHand.map(c => c.id)).toEqual(viewer.hand)
      expect(snapshot.game!.drawPileCount).toBe(state.game!.drawPile.length)
    }
  })

  it('reveals hands in the round result after a yaniv call', () => {
    const state = startedRoom(2)
    const caller = currentPlayer(state)
    const opponent = state.players.find(p => p.id !== caller.id)!
    const all = [...caller.hand, ...opponent.hand, ...state.game!.drawPile, ...state.game!.discardHistory, ...state.game!.lastDiscardPacket]
    caller.hand = ['hearts-2']
    opponent.hand = ['spades-K']
    state.game!.discardHistory = []
    state.game!.drawPile = all.filter(id => id !== 'hearts-2' && id !== 'spades-K')
    state.game!.lastDiscardPacket = [state.game!.drawPile.shift()!]

    const next = applyAction(state, caller.id, { type: 'call_yaniv' }, ctx())
    const snapshot = projectRoomForPlayer(next, opponent.id)
    const callerEntry = snapshot.game!.roundResult!.entries.find(e => e.playerId === caller.id)!
    expect(callerEntry.hand.map(c => c.id)).toEqual(['hearts-2'])
  })
})

describe('deterministic reducer', () => {
  it('produces identical output for identical input', () => {
    const room = lobbyRoom(3)
    const a = applyAction(room, 'p0', { type: 'start_match' }, ctx(99))
    const b = applyAction(room, 'p0', { type: 'start_match' }, ctx(99))
    expect(a).toEqual(b)
  })
})

describe('randomized legal play property test', () => {
  it('preserves invariants across many random legal turns', () => {
    for (let seed = 1; seed <= 5; seed++) {
      let state = startedRoom(3, seed)
      const rng = createSeededRandom(seed * 1000)
      for (let turn = 0; turn < 120 && state.status === 'playing' && state.game!.phase === 'awaiting_turn'; turn++) {
        const actor = currentPlayer(state)
        const value = handValue(cardsByIds(actor.hand))
        if (value <= 5 && rng.nextInt(3) === 0) {
          state = applyAction(state, actor.id, { type: 'call_yaniv' }, { now: NOW, random: rng })
        }
        else {
          const discard = actor.hand[rng.nextInt(actor.hand.length)]!
          const packet = state.game!.lastDiscardPacket
          const drawFromPacket = rng.nextInt(2) === 0 && packet.length > 0
          state = applyAction(state, actor.id, {
            type: 'play_turn',
            discardCardIds: [discard],
            draw: drawFromPacket
              ? { source: 'previous_discard', cardId: rng.nextInt(2) === 0 ? packet[0]! : packet[packet.length - 1]! }
              : { source: 'deck' },
          }, { now: NOW, random: rng })
        }
        assertRoomInvariants(state)
        for (const viewer of state.players) {
          const snap = projectRoomForPlayer(state, viewer.id)
          expect(snap.game!.ownHand.map(c => c.id)).toEqual(viewer.hand)
        }
      }
    }
  })
})

describe('cardById', () => {
  it('throws on unknown ids', () => {
    expect(() => cardById('hearts-fake')).toThrow()
  })
})
