<script setup lang="ts">
import type { GameAction } from '#shared/protocol/actions'
import { useRoomSession, type StoredSession } from '../../composables/useRoomSession'
import { useRoomSocket } from '../../composables/useRoomSocket'

const route = useRoute()
const roomCode = computed(() => String(route.params.code ?? '').toUpperCase())
const sessionStore = useRoomSession()

const seat = ref<StoredSession | null>(null)
const socket = shallowRef<ReturnType<typeof useRoomSocket> | null>(null)

// Join form for visitors following a share link without a seat.
const joinName = ref('')
const joinBusy = ref(false)
const joinError = ref('')

onMounted(() => {
  joinName.value = sessionStore.rememberedName()
  const existing = sessionStore.sessionFor(roomCode.value)
  if (existing) connect(existing)
})

function connect(s: StoredSession): void {
  seat.value = s
  socket.value = useRoomSocket(s)
}

async function joinFromLink(): Promise<void> {
  joinError.value = ''
  joinBusy.value = true
  try {
    const result = await $fetch(`/api/rooms/${roomCode.value}/join`, {
      method: 'POST',
      body: { displayName: joinName.value },
    })
    const s: StoredSession = {
      roomCode: result.roomCode,
      playerId: result.playerId,
      playerToken: result.playerToken,
      displayName: joinName.value.trim(),
    }
    sessionStore.save(s)
    connect(s)
  }
  catch (e: any) {
    joinError.value = e?.data?.data?.message ?? 'Could not join this room.'
  }
  finally {
    joinBusy.value = false
  }
}

const snapshot = computed(() => socket.value?.snapshot.value ?? null)
const isPending = computed(() => socket.value?.isPending.value ?? false)
const status = computed(() => socket.value?.status.value)
const lastError = computed(() => socket.value?.lastError.value)

const showReconnectBanner = computed(() =>
  status.value === 'reconnecting' || status.value === 'connecting')

function sendAction(action: GameAction): void {
  socket.value?.sendAction(action)
}

async function leave(): Promise<void> {
  sendAction({ type: 'leave_room' })
  sessionStore.clear()
  socket.value?.close()
  await navigateTo('/')
}

const showRoundResult = computed(() =>
  snapshot.value?.game
  && (snapshot.value.game.phase === 'round_over' || snapshot.value.game.phase === 'match_over')
  && (snapshot.value.game.roundResult || snapshot.value.game.phase === 'match_over'))

const abandoned = computed(() =>
  snapshot.value?.status === 'finished'
  && (!snapshot.value.game || (snapshot.value.game.phase === 'match_over' && !snapshot.value.game.roundResult && !snapshot.value.game.winnerPlayerId)))
</script>

<template>
  <div>
    <!-- No seat: name entry to join via link -->
    <div v-if="!seat" class="join-screen">
      <form class="panel join-box" @submit.prevent="joinFromLink">
        <h1>Join room {{ roomCode }}</h1>
        <div class="field">
          <label for="join-name">Your name</label>
          <input id="join-name" v-model="joinName" required maxlength="20" autocomplete="nickname">
        </div>
        <button type="submit" class="btn btn-primary" :disabled="joinBusy || !joinName.trim()">
          Join game
        </button>
        <p v-if="joinError" class="error" role="alert">{{ joinError }}</p>
        <NuxtLink to="/" class="back">Back to home</NuxtLink>
      </form>
    </div>

    <template v-else>
      <div v-if="showReconnectBanner" class="banner" role="status">
        Connecting…
      </div>
      <div v-if="socket?.seatLost.value" class="seat-lost">
        <div class="panel join-box">
          <h1>Connection replaced</h1>
          <p>This seat was opened in another tab, or the session is no longer valid.</p>
          <NuxtLink to="/" class="btn btn-primary">Back to home</NuxtLink>
        </div>
      </div>

      <div v-else-if="!snapshot" class="join-screen">
        <p class="loading" role="status">Loading room…</p>
      </div>

      <template v-else>
        <div
          v-if="lastError && lastError.code !== 'STALE_STATE'"
          class="banner error-banner"
          role="alert"
          @click="socket?.clearError()"
        >
          {{ lastError.message }}
        </div>

        <RoomLobby
          v-if="snapshot.status === 'lobby'"
          :snapshot="snapshot"
          :is-pending="isPending"
          @start="sendAction({ type: 'start_match' })"
          @leave="leave"
        />

        <div v-else-if="abandoned" class="join-screen">
          <div class="panel join-box">
            <h1>Game ended</h1>
            <p>This match ended without a winner.</p>
            <NuxtLink to="/" class="btn btn-primary" @click="sessionStore.clear()">Back to home</NuxtLink>
          </div>
        </div>

        <template v-else-if="snapshot.game">
          <GameBoard
            :snapshot="snapshot"
            :is-pending="isPending"
            @action="sendAction"
            @leave="leave"
          />
          <GamePausedOverlay
            v-if="snapshot.status === 'paused'"
            :snapshot="snapshot"
            :is-pending="isPending"
            @remove="(id: string) => sendAction({ type: 'remove_disconnected_and_restart_round', playerId: id })"
            @leave="leave"
          />
          <GameRoundResult
            v-if="showRoundResult"
            :snapshot="snapshot"
            :is-pending="isPending"
            @ready="sendAction({ type: 'ready_next_round' })"
            @leave="leave"
          />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.join-screen,
.seat-lost {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.join-box {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.join-box h1 {
  margin: 0;
  font-size: 1.3rem;
}

.error {
  color: var(--danger);
  margin: 0;
}

.back {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.loading {
  color: var(--panel);
}

.banner {
  position: sticky;
  top: 0;
  z-index: 40;
  text-align: center;
  padding: 0.4rem;
  background: #e0b34c;
  color: #442;
  font-size: 0.9rem;
}

.error-banner {
  background: #d9776f;
  color: #fff;
  cursor: pointer;
}
</style>
