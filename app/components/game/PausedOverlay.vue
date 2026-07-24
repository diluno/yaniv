<script setup lang="ts">
import type { ClientRoomSnapshot } from '#shared/types/room'

const props = defineProps<{
  snapshot: ClientRoomSnapshot
  isPending: boolean
}>()

defineEmits<{ remove: [playerId: string], leave: [] }>()

const missing = computed(() => {
  const ids = props.snapshot.disconnectRecovery?.missingPlayerIds ?? []
  return props.snapshot.players.filter(p => ids.includes(p.id))
})

const isHost = computed(() => props.snapshot.hostPlayerId === props.snapshot.selfPlayerId)
const canRemove = computed(() => props.snapshot.disconnectRecovery?.hostCanRestartWithoutMissingPlayers)
</script>

<template>
  <div class="overlay" role="alertdialog" aria-modal="true" aria-label="Game paused">
    <div class="box panel">
      <h2>Game paused</h2>
      <p role="status">
        Waiting for
        {{ missing.map(p => p.displayName).join(' and ') || 'players' }}
        to reconnect. The game resumes automatically when everyone is back.
      </p>
      <div v-if="isHost && canRemove" class="host-actions">
        <button
          v-for="p in missing"
          :key="p.id"
          type="button"
          class="btn btn-secondary"
          :disabled="isPending"
          @click="$emit('remove', p.id)"
        >
          Remove {{ p.displayName }} and restart round
        </button>
      </div>
      <p v-else-if="isHost" class="hint">
        You can remove a missing player after they have been gone for two minutes.
      </p>
      <button type="button" class="btn btn-ghost leave" @click="$emit('leave')">
        Leave game
      </button>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 30, 25, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 20;
}

.box {
  max-width: 420px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

h2 {
  margin: 0;
  font-size: 1.2rem;
}

p {
  margin: 0;
}

.hint {
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.host-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.leave {
  color: var(--ink);
  border-color: #cfc8b8;
}
</style>
