import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isValidRoomCode } from '@scrum-poker/shared'
import { generateRoomCode } from '../src/code.js'

describe('generateRoomCode', () => {
  it('выдаёт код нужной длины', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
    }
  })

  it('использует только символы безопасного алфавита', () => {
    const forbidden = ['O', '0', 'I', '1', 'L']
    for (let i = 0; i < 200; i += 1) {
      const code = generateRoomCode()
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch)
      for (const ch of forbidden) expect(code).not.toContain(ch)
      expect(isValidRoomCode(code)).toBe(true)
    }
  })

  it('редко повторяется', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 2000; i += 1) codes.add(generateRoomCode())
    expect(codes.size).toBeGreaterThan(1990)
  })
})
