import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/game/constants'

export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase()
}

export function isValidRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH
    && [...code].every(ch => ROOM_CODE_ALPHABET.includes(ch))
}
