<script setup lang="ts">
import { useRoomSession } from '../composables/useRoomSession'

const session = useRoomSession()
const displayName = ref('')
const roomCode = ref('')
const busy = ref(false)
const error = ref('')

onMounted(() => {
  displayName.value = session.rememberedName()
})

async function createRoom(): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const result = await $fetch('/api/rooms', {
      method: 'POST',
      body: { displayName: displayName.value },
    })
    session.save({
      roomCode: result.roomCode,
      playerId: result.playerId,
      playerToken: result.playerToken,
      displayName: displayName.value.trim(),
    })
    await navigateTo(result.sharePath)
  }
  catch (e: any) {
    error.value = e?.data?.data?.message ?? 'Could not create the room.'
  }
  finally {
    busy.value = false
  }
}

async function joinRoom(): Promise<void> {
  error.value = ''
  const code = roomCode.value.trim().toUpperCase()
  if (!code) {
    error.value = 'Enter a room code to join.'
    return
  }
  busy.value = true
  try {
    const result = await $fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      body: { displayName: displayName.value },
    })
    session.save({
      roomCode: result.roomCode,
      playerId: result.playerId,
      playerToken: result.playerToken,
      displayName: displayName.value.trim(),
    })
    await navigateTo(result.sharePath)
  }
  catch (e: any) {
    error.value = e?.data?.data?.message ?? 'Could not join the room.'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="home">
    <div class="panel card-box">
      <h1>Yaniv</h1>
      <p class="tagline">Create a private room or join with a code.</p>

      <form @submit.prevent="createRoom">
        <div class="field">
          <label for="name">Your name</label>
          <input
            id="name"
            v-model="displayName"
            required
            maxlength="20"
            autocomplete="nickname"
            placeholder="e.g. Sam"
          >
        </div>
        <button type="submit" class="btn btn-primary wide" :disabled="busy || !displayName.trim()">
          Create room
        </button>
      </form>

      <div class="divider" role="separator">or</div>

      <form @submit.prevent="joinRoom">
        <div class="field">
          <label for="code">Room code</label>
          <input
            id="code"
            v-model="roomCode"
            maxlength="6"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            placeholder="e.g. K7M4PX"
            class="code-input"
          >
        </div>
        <button type="submit" class="btn btn-secondary wide" :disabled="busy || !displayName.trim()">
          Join room
        </button>
      </form>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <details class="rules">
        <summary>How to play</summary>
        <ul>
          <li>Everyone gets 5 cards. Lowest total hand wins the round.</li>
          <li>On your turn: discard a single card, a set of one rank, or a run of 3+ same-suit cards, then draw from the deck or take an end card of the previous play.</li>
          <li>Aces are 1, face cards 10, jokers 0. Jokers can fill gaps in runs.</li>
          <li>At 5 points or fewer you may call <strong>Yaniv</strong> at the start of your turn.</li>
          <li>If someone else has an equal or lower hand, that's an <strong>Assaf</strong> — the caller gets their hand value plus 30.</li>
          <li>Landing on exactly 50 resets you to 0; exactly 100 resets to 50. Over 100 you're out. Last player standing wins.</li>
        </ul>
      </details>
    </div>
  </div>
</template>

<style scoped>
.home {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.card-box {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

h1 {
  margin: 0;
  font-size: 2rem;
}

.tagline {
  margin: 0;
  color: var(--ink-soft);
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.wide {
  width: 100%;
}

.code-input {
  text-transform: uppercase;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.15em;
}

.divider {
  text-align: center;
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.error {
  color: var(--danger);
  margin: 0;
}

.rules summary {
  cursor: pointer;
  font-weight: 600;
}

.rules ul {
  padding-left: 1.1rem;
  font-size: 0.9rem;
  color: var(--ink-soft);
}
</style>
