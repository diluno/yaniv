<script setup lang="ts">
import type { ClientPlayer } from '#shared/types/room'

defineProps<{
  player: ClientPlayer
  isCurrentTurn: boolean
  isHost: boolean
}>()
</script>

<template>
  <div class="seat" :class="{ turn: isCurrentTurn, out: player.eliminated }">
    <div class="row">
      <span class="name">
        {{ player.displayName }}
        <span v-if="isHost" class="tag" title="Host">host</span>
      </span>
      <span
        class="status"
        :class="player.connectionStatus"
        :title="player.connectionStatus"
      >
        <span class="visually-hidden">{{ player.connectionStatus }}</span>
      </span>
    </div>
    <div class="row meta">
      <span>{{ player.eliminated ? 'Out' : `${player.score} pts` }}</span>
      <span v-if="!player.eliminated" class="cards" aria-label="cards in hand">
        🂠 {{ player.handCount }}
      </span>
    </div>
    <span v-if="isCurrentTurn" class="turn-marker">Their turn</span>
  </div>
</template>

<style scoped>
.seat {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius);
  color: var(--panel);
  padding: 0.5rem 0.7rem;
  min-width: 7.2rem;
}

.seat.turn {
  border-color: var(--accent);
  background: rgba(201, 111, 59, 0.22);
}

.seat.out {
  opacity: 0.55;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 8rem;
}

.tag {
  font-size: 0.65rem;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  margin-left: 0.2rem;
}

.meta {
  font-size: 0.85rem;
  opacity: 0.9;
}

.status {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  flex: 0 0 auto;
}

.status.connected {
  background: #79c98f;
}

.status.disconnected {
  background: #e0b34c;
}

.status.left {
  background: #999;
}

.turn-marker {
  display: block;
  font-size: 0.72rem;
  color: #ffd9bd;
  margin-top: 0.15rem;
}
</style>
