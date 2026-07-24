<script setup lang="ts">
import type { ClientRoomSnapshot } from '#shared/types/room'

const props = defineProps<{
  snapshot: ClientRoomSnapshot
  isPending: boolean
}>()

defineEmits<{ start: [], leave: [] }>()

const isHost = computed(() => props.snapshot.hostPlayerId === props.snapshot.selfPlayerId)
const connectedCount = computed(() =>
  props.snapshot.players.filter(p => p.connectionStatus === 'connected').length)
const canStart = computed(() => isHost.value && connectedCount.value >= 2)

const copied = ref(false)

async function share(): Promise<void> {
  const url = `${location.origin}/room/${props.snapshot.roomCode}`
  if (navigator.share) {
    await navigator.share({ title: 'Join my Yaniv game', url }).catch(() => {})
    return
  }
  await navigator.clipboard.writeText(url).catch(() => {})
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const seats = computed(() => {
  const list: Array<ClientRoomSnapshot['players'][number] | null> = [...props.snapshot.players].sort((a, b) => a.seat - b.seat)
  while (list.length < 4) list.push(null)
  return list
})
</script>

<template>
  <div class="lobby">
    <div class="panel inner rise-in">
      <h1>Room <span class="code">{{ snapshot.roomCode }}</span></h1>
      <button type="button" class="btn btn-secondary" @click="share">
        {{ copied ? 'Link copied!' : 'Share invite link' }}
      </button>

      <ul class="players">
        <li v-for="(p, i) in seats" :key="p?.id ?? `empty-${i}`" class="player" :class="{ empty: !p }">
          <template v-if="p">
            <span class="dot" :class="p.connectionStatus" />
            <span class="pname">{{ p.displayName }}</span>
            <span v-if="p.id === snapshot.hostPlayerId" class="host-tag">host</span>
            <span v-if="p.id === snapshot.selfPlayerId" class="you-tag">you</span>
          </template>
          <template v-else>
            <span class="dot empty-dot" />
            <span class="pname muted">Waiting for player…</span>
          </template>
        </li>
      </ul>
      <p class="hint">2–4 players. The host can start once two people are here.</p>

      <button
        v-if="isHost"
        type="button"
        class="btn btn-primary"
        :disabled="!canStart || isPending"
        @click="$emit('start')"
      >
        {{ isPending ? 'Starting…' : 'Start game' }}
      </button>
      <p v-else class="hint" role="status">
        Waiting for the host to start the game…
      </p>

      <button type="button" class="btn btn-secondary" @click="$emit('leave')">
        Leave room
      </button>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.inner {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

h1 {
  margin: 0;
  font-size: 1.3rem;
}

.code {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.18em;
  background: linear-gradient(180deg, #fff 0%, var(--panel-soft) 100%);
  border: 1px solid rgba(120, 100, 60, 0.25);
  border-radius: 8px;
  padding: 0.15rem 0.55rem;
  box-shadow: inset 0 1px 2px rgba(120, 100, 60, 0.12);
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.player {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--panel-soft);
  border-radius: var(--radius);
  padding: 0.55rem 0.75rem;
  animation: rise-in 320ms var(--ease-pop) both;
}

.player.empty {
  opacity: 0.65;
}

.dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  flex: 0 0 auto;
}

.dot.connected {
  background: var(--ok);
}

.dot.disconnected {
  background: #d5a53c;
}

.empty-dot {
  background: #ccc;
}

.pname {
  font-weight: 600;
}

.muted {
  font-weight: 400;
  color: var(--ink-soft);
}

.host-tag,
.you-tag {
  font-size: 0.65rem;
  text-transform: uppercase;
  background: #e4ddcd;
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
</style>
