import path from 'node:path'

/** Каталог собранного интерфейса: apps/web/dist. */
const defaultWebDist = path.resolve(import.meta.dirname, '..', '..', 'web', 'dist')

function readPort(): number {
  const raw = Number(process.env.PORT ?? 3000)
  return Number.isInteger(raw) && raw > 0 && raw < 65_536 ? raw : 3000
}

export const config = {
  port: readPort(),
  host: process.env.HOST ?? '0.0.0.0',
  webDist: path.resolve(process.env.WEB_DIST ?? defaultWebDist),
  /** Включать, если сервис стоит за обратным прокси (NFR-4). */
  trustProxy: process.env.TRUST_PROXY === '1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
}
