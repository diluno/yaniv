export interface PlayTurnAction {
  type: 'play_turn'
  discardCardIds: string[]
  draw:
    | { source: 'deck' }
    | { source: 'previous_discard'; cardId: string }
}

export type GameAction =
  | { type: 'start_match' }
  | PlayTurnAction
  | { type: 'call_yaniv' }
  | { type: 'ready_next_round' }
  | { type: 'remove_disconnected_and_restart_round'; playerId: string }
  | { type: 'leave_room' }
  | { type: 'end_room' }
