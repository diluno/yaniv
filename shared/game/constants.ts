export const GAME_CONFIG = {
  minPlayers: 2,
  maxPlayers: 4,
  startingHandSize: 5,
  yanivThreshold: 5,
  assafPenalty: 30,
  eliminationScore: 100,
  exactFiftyResetsTo: 0,
  exactHundredResetsTo: 50,
  jokerCount: 2,
  deckSize: 54,
} as const

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

export const DISPLAY_NAME_MIN_LENGTH = 1
export const DISPLAY_NAME_MAX_LENGTH = 20

export const TTL_SECONDS = {
  lobby: 2 * 60 * 60,
  playing: 6 * 60 * 60,
  finished: 1 * 60 * 60,
} as const

export const DISCONNECT_REMOVE_GRACE_MS = 2 * 60 * 1000
export const HOST_TRANSFER_GRACE_MS = 30 * 1000

export const RECENT_ACTION_IDS_LIMIT = 50
