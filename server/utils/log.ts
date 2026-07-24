type LogEvent =
  | 'room_created' | 'player_joined' | 'player_connected' | 'player_disconnected'
  | 'match_started' | 'turn_committed' | 'yaniv_called' | 'round_finished'
  | 'player_eliminated' | 'match_finished' | 'room_abandoned' | 'action_rejected'
  | 'cas_retry' | 'websocket_error'

/** Structured single-line logs. Never pass tokens or card hands here. */
export function logEvent(event: LogEvent, fields: Record<string, string | number | undefined> = {}): void {
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...fields }))
}
