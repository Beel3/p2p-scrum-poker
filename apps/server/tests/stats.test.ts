import { describe, expect, it } from 'vitest'
import { computeStats } from '../src/stats.js'

describe('computeStats', () => {
  it('возвращает пустую сводку, если никто не голосовал', () => {
    expect(computeStats([], 6)).toEqual({
      evaluated: 0,
      total: 6,
      median: null,
      mean: null,
      min: null,
      max: null,
    })
  })

  it('считает медиану и среднее для нечётного числа голосов', () => {
    const stats = computeStats([3, 1, 2], 3)
    expect(stats.median).toBe(2)
    expect(stats.mean).toBe(2)
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(3)
    expect(stats.evaluated).toBe(3)
    expect(stats.total).toBe(3)
  })

  it('берёт среднее двух центральных значений при чётном числе голосов', () => {
    const stats = computeStats([4, 1, 2, 3], 4)
    expect(stats.median).toBe(2.5)
    expect(stats.mean).toBe(2.5)
  })

  it('поддерживает значение 0.5 из колоды', () => {
    const stats = computeStats([0.5, 1], 2)
    expect(stats.median).toBe(0.8)
    expect(stats.mean).toBe(0.8)
    expect(stats.min).toBe(0.5)
    expect(stats.max).toBe(1)
  })

  it('округляет среднее до одного знака', () => {
    const stats = computeStats([1, 2, 3, 4, 10], 5)
    expect(stats.mean).toBe(4)
    expect(stats.median).toBe(3)
    expect(stats.max).toBe(10)
  })

  it('не зависит от порядка голосов', () => {
    const a = computeStats([8, 2, 5, 3], 4)
    const b = computeStats([2, 3, 5, 8], 4)
    expect(a).toEqual(b)
  })

  it('разброс отражает крайние оценки', () => {
    const stats = computeStats([0, 10], 2)
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(10)
  })
})
