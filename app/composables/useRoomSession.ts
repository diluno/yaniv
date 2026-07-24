export interface StoredSession {
  roomCode: string
  playerId: string
  playerToken: string
  displayName: string
}

const STORAGE_KEY = 'yaniv:session'
const NAME_KEY = 'yaniv:name'

export function useRoomSession() {
  function load(): StoredSession | null {
    if (!import.meta.client) return null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) as StoredSession : null
    }
    catch {
      return null
    }
  }

  function save(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    localStorage.setItem(NAME_KEY, session.displayName)
  }

  function clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  }

  function sessionFor(roomCode: string): StoredSession | null {
    const session = load()
    return session && session.roomCode === roomCode ? session : null
  }

  function rememberedName(): string {
    if (!import.meta.client) return ''
    return localStorage.getItem(NAME_KEY) ?? ''
  }

  return { load, save, clear, sessionFor, rememberedName }
}
