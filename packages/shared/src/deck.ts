/**
 * Колода по умолчанию: 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
 * См. ТЗ, раздел 2.1 (FR требует ровно 12 карт).
 */
export const DECK = [0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export type Card = (typeof DECK)[number]

const CARD_SET: ReadonlySet<number> = new Set<number>(DECK)

/** Проверяет, что значение входит в колоду. */
export function isCard(value: unknown): value is Card {
  return typeof value === 'number' && CARD_SET.has(value)
}

export const MAX_PARTICIPANTS = 16
export const NICK_MAX_LENGTH = 24
export const ROOM_CODE_LENGTH = 6

/**
 * Алфавит кода комнаты: исключены визуально похожие символы O, 0, I, 1, L.
 * См. ТЗ, FR-01.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)
