import { describe, expect, it } from 'vitest'
import { createDeck, cardById, cardsByIds } from '../../shared/game/deck'
import { cardValue, handValue } from '../../shared/game/cards'
import { classifyDiscard, isValidRun, isValidSet, autoOrderRun } from '../../shared/game/discard-validation'
import { createSeededRandom } from '../../shared/game/random'
import { shuffleDeck } from '../../shared/game/deck'

const c = (id: string) => cardById(id)
const cs = (...ids: string[]) => cardsByIds(ids)

describe('deck', () => {
  it('has 54 unique card ids', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(54)
    expect(new Set(deck.map(x => x.id)).size).toBe(54)
  })

  it('shuffle preserves the card multiset', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck, createSeededRandom(42))
    expect(new Set(shuffled.map(x => x.id)).size).toBe(54)
    expect(shuffled).not.toEqual(deck)
  })
})

describe('card values', () => {
  it('scores ace as 1, numbers at face, courts as 10, joker as 0', () => {
    expect(cardValue(c('clubs-A'))).toBe(1)
    expect(cardValue(c('hearts-2'))).toBe(2)
    expect(cardValue(c('spades-9'))).toBe(9)
    expect(cardValue(c('diamonds-10'))).toBe(10)
    expect(cardValue(c('clubs-J'))).toBe(10)
    expect(cardValue(c('hearts-Q'))).toBe(10)
    expect(cardValue(c('spades-K'))).toBe(10)
    expect(cardValue(c('joker-1'))).toBe(0)
  })

  it('sums hand totals', () => {
    expect(handValue(cs('clubs-A', 'hearts-2', 'joker-1', 'spades-K'))).toBe(13)
    expect(handValue([])).toBe(0)
  })
})

describe('singles and sets', () => {
  it('accepts any single card', () => {
    expect(classifyDiscard(cs('joker-1')).kind).toBe('single')
    expect(classifyDiscard(cs('hearts-7')).kind).toBe('single')
  })

  it('accepts pairs, triples, and four-card sets', () => {
    expect(classifyDiscard(cs('hearts-7', 'clubs-7')).kind).toBe('set')
    expect(classifyDiscard(cs('hearts-7', 'clubs-7', 'spades-7')).kind).toBe('set')
    expect(classifyDiscard(cs('hearts-7', 'clubs-7', 'spades-7', 'diamonds-7')).kind).toBe('set')
  })

  it('accepts the joker pair as a set', () => {
    expect(classifyDiscard(cs('joker-1', 'joker-2')).kind).toBe('set')
  })

  it('rejects mixed-rank sets and joker-in-rank-set', () => {
    expect(classifyDiscard(cs('hearts-7', 'clubs-8')).kind).toBe('invalid')
    expect(isValidSet(cs('hearts-7', 'clubs-7', 'joker-1'))).toBe(false)
  })
})

describe('runs', () => {
  it('accepts basic runs including A-2-3 and 10-J-Q-K', () => {
    expect(classifyDiscard(cs('hearts-3', 'hearts-4', 'hearts-5')).kind).toBe('run')
    expect(classifyDiscard(cs('clubs-A', 'clubs-2', 'clubs-3')).kind).toBe('run')
    expect(classifyDiscard(cs('spades-10', 'spades-J', 'spades-Q', 'spades-K')).kind).toBe('run')
  })

  it('rejects Q-K-A (ace is low only)', () => {
    expect(classifyDiscard(cs('hearts-Q', 'hearts-K', 'hearts-A')).kind).toBe('invalid')
  })

  it('accepts a joker at beginning, middle, and end', () => {
    expect(isValidRun(cs('joker-1', 'hearts-4', 'hearts-5'))).toBe(true)
    expect(isValidRun(cs('hearts-3', 'joker-1', 'hearts-5'))).toBe(true)
    expect(isValidRun(cs('hearts-3', 'hearts-4', 'joker-1'))).toBe(true)
  })

  it('accepts runs with two jokers', () => {
    expect(isValidRun(cs('hearts-3', 'joker-1', 'joker-2', 'hearts-6'))).toBe(true)
  })

  it('rejects a joker run overflowing past king or below ace', () => {
    expect(isValidRun(cs('hearts-Q', 'hearts-K', 'joker-1'))).toBe(false)
    expect(isValidRun(cs('joker-1', 'hearts-A', 'hearts-2'))).toBe(false)
  })

  it('rejects mixed suits', () => {
    expect(isValidRun(cs('hearts-3', 'clubs-4', 'hearts-5'))).toBe(false)
  })

  it('rejects an all-joker run', () => {
    expect(isValidRun(cs('joker-1', 'joker-2', 'joker-1'))).toBe(false)
  })

  it('accepts two jokers plus one card when the sequence fits', () => {
    // jokers stand for 7 and 8 of clubs
    expect(classifyDiscard(cs('joker-1', 'joker-2', 'clubs-9')).kind).toBe('run')
  })

  it('rejects a valid combination submitted in an invalid order', () => {
    expect(isValidRun(cs('hearts-4', 'hearts-3', 'hearts-5'))).toBe(false)
    expect(classifyDiscard(cs('hearts-4', 'hearts-3', 'hearts-5')).kind).toBe('invalid')
  })

  it('rejects runs shorter than three', () => {
    expect(isValidRun(cs('hearts-3', 'hearts-4'))).toBe(false)
  })
})

describe('autoOrderRun', () => {
  it('sorts a scrambled run into a valid ascending order', () => {
    const ordered = autoOrderRun(cs('hearts-5', 'hearts-3', 'hearts-4'))!
    expect(ordered.map(x => x.id)).toEqual(['hearts-3', 'hearts-4', 'hearts-5'])
  })

  it('places jokers into gaps', () => {
    const ordered = autoOrderRun(cs('hearts-5', 'joker-1', 'hearts-3'))!
    expect(ordered.map(x => x.id)).toEqual(['hearts-3', 'joker-1', 'hearts-5'])
  })

  it('returns null when no ordering works', () => {
    expect(autoOrderRun(cs('hearts-3', 'hearts-5', 'hearts-9'))).toBeNull()
    expect(autoOrderRun(cs('hearts-3', 'clubs-4', 'hearts-5'))).toBeNull()
  })
})
