<script setup lang="ts">
import type { Card } from '../../../shared/game/cards'
import type { DiscardClassification } from '../../../shared/game/discard-validation'

const props = defineProps<{
  selectedCards: Card[]
  classification: DiscardClassification
  canAutoOrder: boolean
  drawChoice: 'deck' | string | null
  isOwnTurn: boolean
  isPending: boolean
  canCallYaniv: boolean
  ownHandValue: number
  drawPileCount: number
  packetHasChoices: boolean
}>()

const emit = defineEmits<{
  playTurn: []
  callYaniv: []
  autoOrder: []
  moveEarlier: [cardId: string]
  chooseDeck: []
}>()

const packetLabel = computed(() => {
  const k = props.classification.kind
  if (k === 'single') return 'Single'
  if (k === 'set') return 'Set'
  if (k === 'run') return 'Run'
  return 'Invalid'
})

const canSubmit = computed(() =>
  props.isOwnTurn
  && !props.isPending
  && props.classification.kind !== 'invalid'
  && props.selectedCards.length > 0
  && props.drawChoice !== null,
)

const submitLabel = computed(() => {
  const count = props.selectedCards.length
  if (count === 0) return 'Select cards to play'
  const drawText = props.drawChoice === 'deck' ? 'draw from deck' : props.drawChoice ? 'take from last play' : 'choose a draw'
  return `Discard ${count} · ${drawText}`
})

const confirmingYaniv = ref(false)

function onYanivClick(): void {
  if (!confirmingYaniv.value) {
    confirmingYaniv.value = true
    return
  }
  confirmingYaniv.value = false
  emit('callYaniv')
}
</script>

<template>
  <div class="controls">
    <div v-if="selectedCards.length > 0" class="play-strip panel">
      <div class="strip-head">
        <span>
          Your play:
          <strong :class="{ invalid: classification.kind === 'invalid' }">{{ packetLabel }}</strong>
        </span>
        <button v-if="canAutoOrder" type="button" class="btn btn-secondary small-btn" @click="$emit('autoOrder')">
          Auto-order run
        </button>
      </div>
      <p v-if="classification.kind === 'invalid'" class="why" role="status">
        {{ classification.reason }}
      </p>
      <div class="strip-cards">
        <button
          v-for="(card, i) in selectedCards"
          :key="card.id"
          type="button"
          class="strip-card"
          :aria-label="`Move ${card.rank} earlier in the play order`"
          :disabled="i === 0"
          @click="$emit('moveEarlier', card.id)"
        >
          <CardsPlayingCard :card="card" small />
        </button>
      </div>
      <p class="hint">Tap a card in the strip to move it earlier.</p>
    </div>

    <div v-if="isOwnTurn && classification.kind !== 'invalid' && selectedCards.length > 0" class="draw-row">
      <button
        type="button"
        class="btn btn-secondary"
        :class="{ chosen: drawChoice === 'deck' }"
        :aria-pressed="drawChoice === 'deck'"
        @click="$emit('chooseDeck')"
      >
        Draw from deck ({{ drawPileCount }})
      </button>
      <span v-if="packetHasChoices" class="hint light">…or tap a card in “Last play”.</span>
    </div>

    <div class="actions">
      <button
        v-if="canCallYaniv"
        type="button"
        class="btn btn-secondary yaniv"
        :disabled="isPending"
        @click="onYanivClick"
      >
        {{ confirmingYaniv ? `Call Yaniv with ${ownHandValue}? Tap to confirm` : `Call Yaniv (${ownHandValue})` }}
      </button>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!canSubmit"
        @click="$emit('playTurn')"
      >
        {{ isPending ? 'Playing…' : submitLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.play-strip {
  padding: 0.6rem 0.75rem;
}

.strip-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.invalid {
  color: var(--danger);
}

.why {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.strip-cards {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.5rem;
  overflow-x: auto;
}

.strip-card {
  background: none;
  border: none;
  padding: 0;
  border-radius: var(--radius-card);
}

.strip-card:disabled {
  cursor: default;
}

.hint {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.hint.light {
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  align-self: center;
}

.small-btn {
  min-height: 34px;
  padding: 0.25rem 0.6rem;
  font-size: 0.8rem;
}

.draw-row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.chosen {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 2px var(--accent);
}

.actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.actions .btn-primary {
  flex: 1 1 auto;
}

.yaniv {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
</style>
