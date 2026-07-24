export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'

export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  | 'JOKER'

export interface Card {
  id: string
  suit: Suit | null
  rank: Rank
  value: number
}

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']

export const NUMBER_RANKS: Exclude<Rank, 'JOKER'>[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
]

/** Sequence position for runs; ace is low only. 1..13, jokers have none. */
export function rankOrder(rank: Rank): number {
  const idx = NUMBER_RANKS.indexOf(rank as Exclude<Rank, 'JOKER'>)
  if (idx === -1) throw new Error(`Rank ${rank} has no sequence order`)
  return idx + 1
}

export function rankValue(rank: Rank): number {
  if (rank === 'JOKER') return 0
  if (rank === 'A') return 1
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

export function cardValue(card: Card): number {
  return rankValue(card.rank)
}

export function handValue(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + cardValue(card), 0)
}

export function isJoker(card: Card): boolean {
  return card.rank === 'JOKER'
}
