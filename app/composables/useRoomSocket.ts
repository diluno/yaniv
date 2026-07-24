import { ref, computed, onBeforeUnmount } from 'vue'
import type { ClientRoomSnapshot } from '../../shared/types/room'
import type { GameAction } from '../../shared/protocol/actions'
import type { ServerMessage } from '../../shared/protocol/server-messages'
import type { StoredSession } from './useRoomSession'

const HEARTBEAT_INTERVAL_MS = 20_000
const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16_000, 30_000]

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed'

interface PendingAction {
  actionId: string
  action: GameAction
  expectedVersion?: number
}

export function useRoomSocket(session: StoredSession) {
  const snapshot = ref<ClientRoomSnapshot | null>(null)
  const status = ref<SocketStatus>('connecting')
  const lastError = ref<{ code: string, message: string } | null>(null)
  const pendingAction = ref<PendingAction | null>(null)
  const seatLost = ref(false)

  let ws: WebSocket | null = null
  let attempts = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let closedByUser = false
  const clientInstanceId = crypto.randomUUID()

  const isPending = computed(() => pendingAction.value !== null)

  function wsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}/api/ws`
  }

  function connect(): void {
    if (closedByUser || seatLost.value) return
    status.value = attempts === 0 ? 'connecting' : 'reconnecting'
    ws = new WebSocket(wsUrl())

    ws.onopen = () => {
      ws!.send(JSON.stringify({
        type: 'authenticate',
        roomCode: session.roomCode,
        playerToken: session.playerToken,
        clientInstanceId,
        lastKnownVersion: snapshot.value?.version,
      }))
    }

    ws.onmessage = (event) => {
      let message: ServerMessage
      try {
        message = JSON.parse(event.data as string)
      }
      catch {
        return
      }
      handleMessage(message)
    }

    ws.onclose = () => {
      stopHeartbeat()
      if (closedByUser || seatLost.value) {
        status.value = 'closed'
        return
      }
      status.value = 'reconnecting'
      const delay = BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)]!
      attempts++
      reconnectTimer = setTimeout(connect, delay + Math.random() * 400)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'authenticated':
        attempts = 0
        status.value = 'connected'
        snapshot.value = message.snapshot
        lastError.value = null
        startHeartbeat()
        // Resubmit an unacknowledged action with the same actionId (idempotent).
        if (pendingAction.value) sendRaw(pendingAction.value)
        break
      case 'snapshot':
        if (!snapshot.value || message.snapshot.version >= snapshot.value.version) {
          snapshot.value = message.snapshot
        }
        break
      case 'action_ack':
        if (pendingAction.value?.actionId === message.actionId) pendingAction.value = null
        break
      case 'error':
        if (message.code === 'AUTH_INVALID' && !message.actionId) {
          // Seat superseded by another tab or token rejected.
          seatLost.value = true
          closedByUser = true
        }
        if (message.actionId && pendingAction.value?.actionId === message.actionId) {
          pendingAction.value = null
        }
        lastError.value = { code: message.code, message: message.message }
        if (message.snapshot) snapshot.value = message.snapshot
        break
      case 'pong':
        break
    }
  }

  function sendRaw(pending: PendingAction): void {
    if (ws?.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({
      type: 'action',
      actionId: pending.actionId,
      expectedVersion: pending.expectedVersion,
      action: pending.action,
    }))
  }

  function sendAction(action: GameAction): void {
    if (pendingAction.value) return
    lastError.value = null
    const pending: PendingAction = {
      actionId: crypto.randomUUID(),
      action,
      expectedVersion: snapshot.value?.version,
    }
    pendingAction.value = pending
    sendRaw(pending)
  }

  function startHeartbeat(): void {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', sentAt: Date.now() }))
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  function close(): void {
    closedByUser = true
    stopHeartbeat()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
    status.value = 'closed'
  }

  onBeforeUnmount(close)
  connect()

  return {
    snapshot,
    status,
    lastError,
    isPending,
    seatLost,
    sendAction,
    close,
    clearError: () => { lastError.value = null },
  }
}
