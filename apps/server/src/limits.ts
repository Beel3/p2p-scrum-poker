/**
 * Скользящее окно: не более `limit` событий на ключ за `windowMs`.
 * Используется для ограничения создания комнат и попыток входа (NFR-6).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs
    const list = (this.hits.get(key) ?? []).filter((at) => at > cutoff)

    if (list.length >= this.limit) {
      this.hits.set(key, list)
      return false
    }

    list.push(now)
    this.hits.set(key, list)
    return true
  }

  /** Вызывается периодически, чтобы карта ключей не росла бесконечно. */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs
    for (const [key, list] of this.hits) {
      const kept = list.filter((at) => at > cutoff)
      if (kept.length === 0) this.hits.delete(key)
      else this.hits.set(key, kept)
    }
  }

  get size(): number {
    return this.hits.size
  }
}
