<script setup lang="ts">
import type { ClientRoomSnapshot } from '#shared/types/room'
import type { GameAction } from '#shared/protocol/actions'
import { useCardSelection } from '../../composables/useCardSelection'

const props = defineProps<{
  snapshot: ClientRoomSnapshot
  isPending: boolean
}>()

const emit = defineEmits<{ action: [action: GameAction], leave: [] }>()

const game = computed(() => props.snapshot.game!)
const self = computed(() => props.snapshot.players.find(p => p.id === props.snapshot.selfPlayerId)!)
const opponents = computed(() =>
  props.snapshot.players
    .filter(p => p.id !== props.snapshot.selfPlayerId)
    .sort((a, b) => a.seat - b.seat))

const isOwnTurn = computed(() =>
  props.snapshot.status === 'playing'
  && game.value.phase === 'awaiting_turn'
  && game.value.currentTurnPlayerId === props.snapshot.selfPlayerId)

const ownHand = computed(() => game.value.ownHand)
const selection = useCardSelection(ownHand)

const drawChoice = ref<'deck' | string | null>(null)

watch(() => game.value.currentTurnPlayerId, () => {
  drawChoice.value = null
  selection.clear()
})

const currentTurnName = computed(() => {
  const id = game.value.currentTurnPlayerId
  if (!id) return ''
  if (id === props.snapshot.selfPlayerId) return 'Your turn'
  return `${props.snapshot.players.find(p => p.id === id)?.displayName ?? 'Someone'}’s turn`
})

// Announce turn and connection changes politely for screen readers.
const announcement = ref('')
watch(currentTurnName, (value) => { announcement.value = value })
watch(() => props.snapshot.status, (status, prev) => {
  if (status !== prev) announcement.value = status === 'paused' ? 'Game paused' : `Game ${status}`
})

function playTurn(): void {
  if (!drawChoice.value || selection.classification.value.kind === 'invalid') return
  emit('action', {
    type: 'play_turn',
    discardCardIds: [...selection.selectedIds.value],
    draw: drawChoice.value === 'deck'
      ? { source: 'deck' }
      : { source: 'previous_discard', cardId: drawChoice.value },
  })
}

function pickPacketCard(cardId: string): void {
  drawChoice.value = drawChoice.value === cardId ? null : cardId
}
</script>

<template>
  <div class="board">
    <div aria-live="polite" class="visually-hidden">{{ announcement }}</div>

    <header class="opponents">
      <GameOpponentSeat
        v-for="p in opponents"
        :key="p.id"
        :player="p"
        :is-current-turn="game.currentTurnPlayerId === p.id"
        :is-host="snapshot.hostPlayerId === p.id"
      />
    </header>

    <main class="table-center">
      <Transition name="turn-swap" mode="out-in">
        <p :key="currentTurnName" class="turn-message" role="status">{{ currentTurnName }}</p>
      </Transition>
      <div class="piles">
        <div class="pile">
          <span class="pile-label">Deck</span>
          <div class="deck-back" aria-label="Face-down draw pile">
            <span class="deck-count">{{ game.drawPileCount }}</span>
          </div>
        </div>
        <div class="pile">
          <span class="pile-label">Last play</span>
          <CardsDiscardPacket
            :cards="game.lastDiscardPacket"
            :drawable-ids="isOwnTurn && selection.classification.value.kind !== 'invalid' && selection.selectedCards.value.length > 0 ? game.legalDrawCardIds : []"
            :selected-draw-id="drawChoice === 'deck' ? null : drawChoice"
            @pick="pickPacketCard"
          />
        </div>
      </div>
    </main>

    <footer class="own-area">
      <div class="own-meta">
        <span><strong>{{ self.displayName }}</strong> · {{ self.score }} pts</span>
        <span>Hand: {{ game.ownHandValue }}</span>
      </div>
      <CardsCardHand
        :cards="ownHand"
        :selected-ids="selection.selectedIds.value"
        :interactive="isOwnTurn && !isPending"
        @toggle="selection.toggle"
      />
      <GameTurnControls
        :selected-cards="selection.selectedCards.value"
        :classification="selection.classification.value"
        :can-auto-order="selection.canAutoOrder.value"
        :draw-choice="drawChoice"
        :is-own-turn="isOwnTurn"
        :is-pending="isPending"
        :can-call-yaniv="Boolean(game.canCallYaniv)"
        :own-hand-value="game.ownHandValue"
        :draw-pile-count="game.drawPileCount"
        :packet-has-choices="game.legalDrawCardIds.length > 0"
        @play-turn="playTurn"
        @call-yaniv="emit('action', { type: 'call_yaniv' })"
        @auto-order="selection.applyAutoOrder"
        @move-earlier="selection.moveEarlier"
        @choose-deck="drawChoice = drawChoice === 'deck' ? null : 'deck'"
      />
      <button type="button" class="btn btn-ghost leave-btn" @click="$emit('leave')">
        Leave game
      </button>
    </footer>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: 0.75rem;
  gap: 0.75rem;
  max-width: 720px;
  margin: 0 auto;
}

.opponents {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
}

.table-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
}

.turn-message {
  color: var(--panel);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.turn-swap-enter-active,
.turn-swap-leave-active {
  transition: opacity 180ms ease, transform 180ms var(--ease-pop);
}

.turn-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.turn-swap-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.piles {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
}

.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.pile-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.8);
}

.deck-back {
  position: relative;
  width: 3.4rem;
  height: 4.8rem;
  border-radius: var(--radius-card);
  background:
    radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.14) 0%, transparent 55%),
    repeating-linear-gradient(45deg, #46586e 0, #46586e 4px, #3a4c61 4px, #3a4c61 8px);
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    2px 2px 0 -1px #2f4054,
    3px 3px 0 -1px rgba(255, 255, 255, 0.35),
    5px 5px 0 -2px #2a3a4d,
    var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 160ms var(--ease-pop);
}

.deck-count {
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.8rem;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.own-area {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0) 30%), var(--table-deep);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.25);
  border-radius: var(--radius);
  padding: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.own-meta {
  display: flex;
  justify-content: space-between;
  color: var(--panel);
  font-size: 0.9rem;
}

.leave-btn {
  align-self: center;
  min-height: 36px;
  font-size: 0.85rem;
}
</style>
