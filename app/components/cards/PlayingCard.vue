<script setup lang="ts">
import type { Card } from '#shared/game/cards'

const props = defineProps<{
  card: Card
  selected?: boolean
  interactive?: boolean
  small?: boolean
}>()

defineEmits<{ toggle: [] }>()

const SUIT_SYMBOLS: Record<string, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
}

const SUIT_NAMES: Record<string, string> = {
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
}

const RANK_NAMES: Record<string, string> = {
  A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King', JOKER: 'Joker',
}

const isRed = computed(() => props.card.suit === 'hearts' || props.card.suit === 'diamonds')
const symbol = computed(() => (props.card.suit ? SUIT_SYMBOLS[props.card.suit] : '★'))
const rankLabel = computed(() => (props.card.rank === 'JOKER' ? '🃏' : props.card.rank))
const accessibleName = computed(() => {
  const rank = RANK_NAMES[props.card.rank] ?? props.card.rank
  const name = props.card.suit ? `${rank} of ${SUIT_NAMES[props.card.suit]}` : rank
  return props.selected ? `${name}, selected` : name
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="card"
    :class="{ red: isRed, selected, small, interactive }"
    :type="interactive ? 'button' : undefined"
    :aria-pressed="interactive ? Boolean(selected) : undefined"
    :aria-label="accessibleName"
    @click="interactive && $emit('toggle')"
  >
    <span class="corner" aria-hidden="true">{{ rankLabel }}<br>{{ symbol }}</span>
    <span class="pip" aria-hidden="true">{{ symbol }}</span>
  </component>
</template>

<style scoped>
.card {
  position: relative;
  width: 3.4rem;
  height: 4.8rem;
  flex: 0 0 auto;
  background: var(--panel);
  border: 1px solid #d6d0c2;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
  color: var(--card-black);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: transform 120ms ease;
}

.card.small {
  width: 2.6rem;
  height: 3.7rem;
}

.card.red {
  color: var(--card-red);
}

.card.interactive {
  cursor: pointer;
}

.card.selected {
  transform: translateY(-0.6rem);
  border-color: var(--accent);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
}

.corner {
  position: absolute;
  top: 0.25rem;
  left: 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1;
  text-align: left;
}

.small .corner {
  font-size: 0.7rem;
}

.pip {
  font-size: 1.5rem;
  margin-top: 0.7rem;
}

.small .pip {
  font-size: 1.1rem;
}
</style>
