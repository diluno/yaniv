import type { Card } from './cards'
import { NUMBER_RANKS, SUITS, rankValue } from './cards'
import type { RandomSource } from './random'
import { shuffleInPlace } from './random'

export function createDeck(): Card[] {
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of NUMBER_RANKS) {
      cards.push({ id: `${suit}-${rank}`, suit, rank, value: rankValue(rank) })
    }
  }
  cards.push({ id: 'joker-1', suit: null, rank: 'JOKER', value: 0 })
  cards.push({ id: 'joker-2', suit: null, rank: 'JOKER', value: 0 })
  return cards
}

export function shuffleDeck(cards: Card[], random: RandomSource): Card[] {
  return shuffleInPlace([...cards], random)
}

const DECK_BY_ID: ReadonlyMap<string, Card> = new Map(createDeck().map(c => [c.id, c]))

/** Resolve a card ID to its immutable card definition. Throws on unknown IDs. */
export function cardById(id: string): Card {
  const card = DECK_BY_ID.get(id)
  if (!card) throw new Error(`Unknown card id: ${id}`)
  return card
}

export function cardsByIds(ids: string[]): Card[] {
  return ids.map(cardById)
}
