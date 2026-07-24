import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from '../../shared/game/constants'
import { DomainError } from '../../shared/game/errors'

/** Trim, collapse whitespace, and validate. Throws INVALID_NAME. */
export function normalizeDisplayName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (length < DISPLAY_NAME_MIN_LENGTH || length > DISPLAY_NAME_MAX_LENGTH) {
    throw new DomainError('INVALID_NAME', 'Names must be 1–20 characters.')
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/.test(name)) {
    throw new DomainError('INVALID_NAME', 'Names cannot contain control characters.')
  }
  return name
}

export function nameKey(name: string): string {
  return name.toLowerCase()
}
