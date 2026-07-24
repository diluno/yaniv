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

const isJoker = computed(() => props.card.rank === 'JOKER')
// The two jokers mirror the red/black pairing of a physical deck.
const isRed = computed(() =>
  props.card.suit === 'hearts' || props.card.suit === 'diamonds' || props.card.id === 'joker-1')
const symbol = computed(() => (props.card.suit ? SUIT_SYMBOLS[props.card.suit] : '★'))
const rankLabel = computed(() => props.card.rank)
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
    <template v-if="isJoker">
      <span class="corner" aria-hidden="true">★</span>
      <span class="joker-face" aria-hidden="true">
        <span class="joker-star">★</span>
        <span class="joker-word">JOKER</span>
      </span>
    </template>
    <template v-else>
      <span class="corner" aria-hidden="true">{{ rankLabel }}<br>{{ symbol }}</span>
      <span class="pip" aria-hidden="true">{{ symbol }}</span>
    </template>
  </component>
</template>

<style scoped>
.card {
  position: relative;
  width: 3.4rem;
  height: 4.8rem;
  flex: 0 0 auto;
  background:
    linear-gradient(160deg, #fffdf6 0%, var(--panel) 55%, #f2ecdd 100%);
  border: 1px solid #d6d0c2;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
  color: var(--card-black);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition:
    transform 180ms var(--ease-pop),
    box-shadow 180ms ease,
    border-color 180ms ease;
  animation: deal-in 360ms var(--ease-pop) both;
  animation-delay: calc(var(--deal-i, 0) * 55ms);
}

.card.interactive:hover {
  transform: translateY(-0.25rem);
  box-shadow: 0 4px 10px rgba(10, 24, 17, 0.28);
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

.card.selected,
.card.interactive.selected:hover {
  transform: translateY(-0.7rem) rotate(-2deg);
  border-color: var(--accent);
  box-shadow: 0 8px 16px rgba(10, 24, 17, 0.32);
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

.joker-face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  margin-top: 0.55rem;
}

.joker-star {
  font-size: 1.35rem;
  line-height: 1;
}

.joker-word {
  font-size: 0.42rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
}

.small .joker-star {
  font-size: 1rem;
}

.small .joker-word {
  font-size: 0.36rem;
}
</style>
