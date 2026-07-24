import type { Card } from './cards'
import { isJoker, rankOrder } from './cards'

export type DiscardClassification =
  | { kind: 'single' }
  | { kind: 'set' }
  | { kind: 'run' }
  | { kind: 'invalid'; reason: string }

/**
 * Validates cards in the exact order the player submitted them.
 * Sets: 2+ same printed rank, or the two jokers together. Jokers are not
 * wildcards inside rank sets. Runs: 3+ consecutive same-suit ranks in the
 * submitted (ascending) order; jokers stand for missing ranks; ace low only.
 */
export function classifyDiscard(cards: Card[]): DiscardClassification {
  if (cards.length === 0) return { kind: 'invalid', reason: 'No cards selected' }

  const ids = new Set(cards.map(c => c.id))
  if (ids.size !== cards.length) return { kind: 'invalid', reason: 'Duplicate cards' }

  if (cards.length === 1) return { kind: 'single' }

  if (isValidSet(cards)) return { kind: 'set' }

  if (cards.length >= 3 && isValidRun(cards)) return { kind: 'run' }

  if (cards.length === 2) {
    return { kind: 'invalid', reason: 'Two cards must share the same rank' }
  }
  return { kind: 'invalid', reason: 'Cards must form a set of one rank or a same-suit run' }
}

export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 2) return false
  const firstRank = cards[0]!.rank
  return cards.every(c => c.rank === firstRank)
}

/**
 * The submitted order itself must describe one consecutive same-suit
 * sequence, with each joker standing for the rank at its position.
 */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false

  const nonJokers = cards.filter(c => !isJoker(c))
  if (nonJokers.length === 0) return false

  const suit = nonJokers[0]!.suit
  if (!nonJokers.every(c => c.suit === suit)) return false

  // Every non-joker at position i implies the run starts at rank (order - i).
  // All implied starts must agree, and the whole run must fit in A..K.
  let start: number | null = null
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    if (isJoker(card)) continue
    const implied = rankOrder(card.rank) - i
    if (start === null) start = implied
    else if (implied !== start) return false
  }
  if (start === null) return false
  return start >= 1 && start + cards.length - 1 <= 13
}

/** Sort a run selection into a valid ascending order, or null if impossible. */
export function autoOrderRun(cards: Card[]): Card[] | null {
  if (cards.length < 3) return null
  const nonJokers = cards.filter(c => !isJoker(c))
  const jokers = cards.filter(isJoker)
  if (nonJokers.length === 0) return null

  const suit = nonJokers[0]!.suit
  if (!nonJokers.every(c => c.suit === suit)) return null

  const sorted = [...nonJokers].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank))
  const orders = sorted.map(c => rankOrder(c.rank))
  if (new Set(orders).size !== orders.length) return null

  // Try every possible start rank; place jokers into gaps and remaining ends.
  const lowest = orders[0]!
  for (let startCandidate = Math.max(1, lowest - jokers.length); startCandidate <= lowest; startCandidate++) {
    if (startCandidate + cards.length - 1 > 13) continue
    const result: (Card | null)[] = new Array(cards.length).fill(null)
    let fits = true
    for (const card of sorted) {
      const pos = rankOrder(card.rank) - startCandidate
      if (pos < 0 || pos >= cards.length || result[pos]) { fits = false; break }
      result[pos] = card
    }
    if (!fits) continue
    const jokerPool = [...jokers]
    const complete = result.map(slot => slot ?? jokerPool.pop() ?? null)
    if (complete.every(Boolean) && jokerPool.length === 0) {
      const ordered = complete as Card[]
      if (isValidRun(ordered)) return ordered
    }
  }
  return null
}

/**
 * Whether a selection could form a run in some order (client feedback helper).
 */
export function canFormRun(cards: Card[]): boolean {
  return autoOrderRun(cards) !== null
}
