import type { Stats } from '@scrum-poker/shared'

/** Округление до одного знака после запятой (ТЗ, FR-05). */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Считает сводку по голосам: медиана, среднее, разброс, число оценивших.
 *
 * @param cards значения из колоды, которые реально выбрал участник
 * @param total сколько участников в комнате (для строки «Оценили N из M»)
 */
export function computeStats(cards: readonly number[], total: number): Stats {
  const sorted = [...cards].sort((a, b) => a - b)
  const evaluated = sorted.length

  if (evaluated === 0) {
    return { evaluated: 0, total, median: null, mean: null, min: null, max: null }
  }

  const mid = Math.floor(evaluated / 2)
  const median = evaluated % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const sum = sorted.reduce((acc, value) => acc + value, 0)

  return {
    evaluated,
    total,
    median: round1(median),
    mean: round1(sum / evaluated),
    min: sorted[0],
    max: sorted[evaluated - 1],
  }
}
