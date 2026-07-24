import { computed, ref, watch, type Ref } from 'vue'
import type { Card } from '../../shared/game/cards'
import { autoOrderRun, classifyDiscard } from '../../shared/game/discard-validation'

/** Client-side selection + ordering. Feedback only; the server re-validates. */
export function useCardSelection(hand: Ref<Card[]>) {
  const selectedIds = ref<string[]>([])

  // Drop selections for cards that left the hand (new deal, committed turn).
  watch(hand, (cards) => {
    const inHand = new Set(cards.map(c => c.id))
    selectedIds.value = selectedIds.value.filter(id => inHand.has(id))
  }, { deep: true })

  const selectedCards = computed<Card[]>(() =>
    selectedIds.value
      .map(id => hand.value.find(c => c.id === id))
      .filter((c): c is Card => Boolean(c)),
  )

  const classification = computed(() => classifyDiscard(selectedCards.value))

  const canAutoOrder = computed(() =>
    classification.value.kind === 'invalid'
    && selectedCards.value.length >= 3
    && autoOrderRun(selectedCards.value) !== null,
  )

  function toggle(cardId: string): void {
    if (selectedIds.value.includes(cardId)) {
      selectedIds.value = selectedIds.value.filter(id => id !== cardId)
    }
    else {
      selectedIds.value = [...selectedIds.value, cardId]
    }
  }

  /** Move a selected card one position toward the front of the packet order. */
  function moveEarlier(cardId: string): void {
    const idx = selectedIds.value.indexOf(cardId)
    if (idx <= 0) return
    const next = [...selectedIds.value]
    ;[next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!]
    selectedIds.value = next
  }

  function applyAutoOrder(): void {
    const ordered = autoOrderRun(selectedCards.value)
    if (ordered) selectedIds.value = ordered.map(c => c.id)
  }

  function clear(): void {
    selectedIds.value = []
  }

  return {
    selectedIds,
    selectedCards,
    classification,
    canAutoOrder,
    toggle,
    moveEarlier,
    applyAutoOrder,
    clear,
  }
}
