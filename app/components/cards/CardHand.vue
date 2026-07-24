<script setup lang="ts">
import type { Card } from '../../../shared/game/cards'

defineProps<{
  cards: Card[]
  selectedIds: string[]
  interactive: boolean
}>()

defineEmits<{ toggle: [cardId: string] }>()
</script>

<template>
  <div class="hand" role="group" aria-label="Your hand">
    <CardsPlayingCard
      v-for="card in cards"
      :key="card.id"
      :card="card"
      :selected="selectedIds.includes(card.id)"
      :interactive="interactive"
      @toggle="$emit('toggle', card.id)"
    />
  </div>
</template>

<style scoped>
.hand {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding: 0.8rem 0.25rem 0.35rem;
  -webkit-overflow-scrolling: touch;
}
</style>
