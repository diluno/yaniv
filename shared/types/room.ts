import type { Card } from '../game/cards'

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished'
export type GamePhase = 'awaiting_turn' | 'round_over' | 'match_over'
export type ConnectionStatus = 'connected' | 'disconnected' | 'left'

export interface RoundResultEntry {
  playerId: string
  hand: string[]
  handValue: number
  pointsAdded: number
  scoreBefore: number
  scoreAfter: number
  resetApplied: 'fifty' | 'hundred' | null
  eliminated: boolean
}

export interface RoundResult {
  outcome: 'yaniv' | 'assaf'
  callerPlayerId: string
  assafWinnerPlayerIds: string[]
  entries: RoundResultEntry[]
  nextStarterPlayerId: string | null
}

export interface RoomPlayer {
  id: string
  tokenHash: string
  displayName: string
  seat: number
  connectionStatus: ConnectionStatus
  connectedAt: string | null
  disconnectedAt: string | null
  lastSeenAt: string | null
  score: number
  eliminated: boolean
  hand: string[]
  readyForNextRound: boolean
}

export interface GameState {
  roundNumber: number
  dealerPlayerId: string
  startingPlayerId: string
  currentTurnPlayerId: string | null
  phase: GamePhase
  drawPile: string[]
  discardHistory: string[]
  lastDiscardPacket: string[]
  roundResult: RoundResult | null
  winnerPlayerId: string | null
}

export interface RoomState {
  schemaVersion: 1
  code: string
  status: RoomStatus
  version: number
  createdAt: string
  updatedAt: string
  expiresAt: string
  hostPlayerId: string
  players: RoomPlayer[]
  game: GameState | null
  recentActionIds: Array<{
    actionId: string
    playerId: string
    resultingVersion: number
  }>
}

// ---- Client projection ----

export interface ClientPlayer {
  id: string
  displayName: string
  seat: number
  connectionStatus: ConnectionStatus
  score: number
  eliminated: boolean
  handCount: number
  readyForNextRound: boolean
}

export interface ClientRoundResultEntry extends Omit<RoundResultEntry, 'hand'> {
  hand: Card[]
}

export interface ClientRoundResult extends Omit<RoundResult, 'entries'> {
  entries: ClientRoundResultEntry[]
}

export interface ClientRoomSnapshot {
  schemaVersion: 1
  roomCode: string
  status: RoomStatus
  version: number
  hostPlayerId: string
  selfPlayerId: string
  players: ClientPlayer[]
  game: null | {
    roundNumber: number
    dealerPlayerId: string
    startingPlayerId: string
    currentTurnPlayerId: string | null
    phase: GamePhase
    ownHand: Card[]
    ownHandValue: number
    drawPileCount: number
    lastDiscardPacket: Card[]
    canCallYaniv: boolean
    legalDrawCardIds: string[]
    roundResult: ClientRoundResult | null
    winnerPlayerId: string | null
  }
  disconnectRecovery: null | {
    missingPlayerIds: string[]
    hostCanRestartWithoutMissingPlayers: boolean
  }
}
