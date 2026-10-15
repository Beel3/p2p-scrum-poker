import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@scrum-poker/shared'

/** Генерирует код комнаты из безопасного алфавита (ТЗ, FR-01). */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length))
  }
  return code
}
