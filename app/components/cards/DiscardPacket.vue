<script setup lang="ts">
import type { Card } from '../../../shared/game/cards'

defineProps<{
  cards: Card[]
  /** Card IDs the current player may draw (endpoints). */
  drawableIds?: string[]
  selectedDrawId?: string | null
}>()

defineEmits<{ pick: [cardId: string] }>()
</script>

<template>
  <div class="packet" role="group" aria-label="Last play">
    <template v-for="card in cards" :key="card.id">
      <button
        v-if="drawableIds?.includes(card.id)"
        type="button"
        class="pick"
        :class="{ picked: selectedDrawId === card.id }"
        :aria-pressed="selectedDrawId === card.id"
        :aria-label="`Take this card`"
        @click="$emit('pick', card.id)"
      >
        <CardsPlayingCard :card="card" small :selected="selectedDrawId === card.id" />
      </button>
      <CardsPlayingCard v-else :card="card" small />
    </template>
  </div>
</template>

<style scoped>
.packet {
  display: flex;
  gap: 0.3rem;
  align-items: flex-end;
}

.pick {
  background: none;
  border: none;
  padding: 0;
  border-radius: var(--radius-card);
}

.pick.picked {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
