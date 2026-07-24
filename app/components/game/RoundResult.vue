<script setup lang="ts">
import type { ClientRoomSnapshot } from '../../../shared/types/room'

const props = defineProps<{
  snapshot: ClientRoomSnapshot
  isPending: boolean
}>()

defineEmits<{ ready: [], leave: [] }>()

const game = computed(() => props.snapshot.game!)
const result = computed(() => game.value.roundResult!)
const isMatchOver = computed(() => game.value.phase === 'match_over')

function playerName(id: string): string {
  return props.snapshot.players.find(p => p.id === id)?.displayName ?? 'Player'
}

const selfEntry = computed(() =>
  result.value?.entries.find(e => e.playerId === props.snapshot.selfPlayerId))

const selfReady = computed(() =>
  props.snapshot.players.find(p => p.id === props.snapshot.selfPlayerId)?.readyForNextRound)

const winnerName = computed(() =>
  game.value.winnerPlayerId ? playerName(game.value.winnerPlayerId) : null)
</script>

<template>
  <div class="sheet-backdrop" role="dialog" aria-modal="true" :aria-label="isMatchOver ? 'Match result' : 'Round result'">
    <div class="sheet panel">
      <template v-if="result">
        <h2>
          {{ result.outcome === 'yaniv' ? 'Yaniv!' : 'Assaf!' }}
          <span class="sub">
            {{ playerName(result.callerPlayerId) }} called
            <template v-if="result.outcome === 'assaf'">
              — {{ result.assafWinnerPlayerIds.map(playerName).join(' and ') }} assafed them (+30 penalty)
            </template>
          </span>
        </h2>

        <ul class="entries">
          <li v-for="entry in result.entries" :key="entry.playerId" class="entry">
            <div class="entry-head">
              <strong>{{ playerName(entry.playerId) }}</strong>
              <span class="points">
                +{{ entry.pointsAdded }} → {{ entry.scoreAfter }}
                <em v-if="entry.resetApplied === 'fifty'"> (hit exactly 50 — reset to 0)</em>
                <em v-else-if="entry.resetApplied === 'hundred'"> (hit exactly 100 — reset to 50)</em>
                <em v-if="entry.eliminated" class="out"> eliminated</em>
              </span>
            </div>
            <div class="entry-hand">
              <CardsPlayingCard v-for="card in entry.hand" :key="card.id" :card="card" small />
              <span class="hand-value">{{ entry.handValue }} pts</span>
            </div>
          </li>
        </ul>
      </template>

      <template v-if="isMatchOver">
        <p class="winner" role="status">
          {{ winnerName ? `${winnerName} wins the match!` : 'The match has ended.' }}
        </p>
        <button type="button" class="btn btn-primary" @click="$emit('leave')">
          Back to home
        </button>
      </template>
      <template v-else>
        <p v-if="result?.nextStarterPlayerId" class="next">
          {{ playerName(result.nextStarterPlayerId) }} starts the next round.
        </p>
        <p class="ready-status" role="status">
          Ready:
          {{snapshot.players.filter(p => !p.eliminated && p.readyForNextRound).map(p => p.displayName).join(', ') || 'nobody yet'}}
        </p>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isPending || Boolean(selfReady) || selfEntry?.eliminated"
          @click="$emit('ready')"
        >
          {{ selfEntry?.eliminated ? 'You are out — watching' : selfReady ? 'Waiting for others…' : 'Ready for next round' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 30, 25, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 30;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: var(--radius) var(--radius) 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

@media (min-width: 640px) {
  .sheet-backdrop {
    align-items: center;
  }

  .sheet {
    border-radius: var(--radius);
  }
}

h2 {
  margin: 0;
  font-size: 1.4rem;
}

.sub {
  display: block;
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--ink-soft);
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.entry-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.95rem;
}

.points em {
  font-style: normal;
  color: var(--ok);
}

.points .out {
  color: var(--danger);
}

.entry-hand {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  margin-top: 0.3rem;
  overflow-x: auto;
}

.hand-value {
  font-size: 0.8rem;
  color: var(--ink-soft);
  margin-left: 0.3rem;
}

.winner {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.next,
.ready-status {
  margin: 0;
  font-size: 0.9rem;
  color: var(--ink-soft);
}
</style>
