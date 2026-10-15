import { describe, expect, it } from 'vitest'
import { SlidingWindowLimiter } from '../src/limits.js'

describe('SlidingWindowLimiter', () => {
  it('пропускает до лимита и блокирует остальное', () => {
    const limiter = new SlidingWindowLimiter(3, 1000)
    const now = 10_000
    expect(limiter.allow('a', now)).toBe(true)
    expect(limiter.allow('a', now)).toBe(true)
    expect(limiter.allow('a', now)).toBe(true)
    expect(limiter.allow('a', now)).toBe(false)
  })

  it('ключи независимы', () => {
    const limiter = new SlidingWindowLimiter(1, 1000)
    expect(limiter.allow('a', 1)).toBe(true)
    expect(limiter.allow('b', 1)).toBe(true)
    expect(limiter.allow('a', 1)).toBe(false)
  })

  it('окно скользит: старые попытки забываются', () => {
    const limiter = new SlidingWindowLimiter(1, 1000)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('a', 500)).toBe(false)
    expect(limiter.allow('a', 1500)).toBe(true)
  })

  it('prune убирает протухшие ключи', () => {
    const limiter = new SlidingWindowLimiter(1, 1000)
    limiter.allow('a', 0)
    expect(limiter.size).toBe(1)
    limiter.prune(5000)
    expect(limiter.size).toBe(0)
  })
})
