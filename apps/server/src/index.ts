import type { FastifyReply, FastifyRequest } from 'fastify'
import Fastify from 'fastify'
import { normalizeRoomCode } from '@scrum-poker/shared'
import { config } from './config.js'
import { SlidingWindowLimiter } from './limits.js'
import { MAX_ROOMS } from './room.js'
import { sendStatic } from './static.js'
import { createRealtime } from './ws.js'

/** Создание комнат: не более 5 в минуту с одного адреса (NFR-6). */
const CREATE_LIMIT = 5
const CREATE_WINDOW_MS = 60_000

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
}

async function main(): Promise<void> {
  const realtime = createRealtime()
  const { manager } = realtime
  const createLimiter = new SlidingWindowLimiter(CREATE_LIMIT, CREATE_WINDOW_MS)

  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 4096,
  })

  app.addHook('onSend', async (_req: FastifyRequest, reply: FastifyReply, payload) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) reply.header(header, value)
    return payload
  })

  app.get('/api/health', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
    ...manager.stats(),
  }))

  app.post('/api/rooms', async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!createLimiter.allow(_req.ip)) {
      return reply
        .code(429)
        .send({ error: 'rate_limited', message: 'Слишком много комнат. Попробуйте через минуту.' })
    }

    const code = manager.createRoom()
    if (!code) {
      return reply.code(429).send({
        error: 'too_many_rooms',
        message: `Достигнут лимит активных комнат (${MAX_ROOMS}).`,
      })
    }

    app.log.info({ room: code, rooms: manager.stats().rooms }, 'room created')
    return reply.code(201).send({ code })
  })

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
    const exists = manager.hasRoom(normalizeRoomCode(req.params.code))
    return reply.code(exists ? 200 : 404).send({ exists })
  })

  // Статика SPA: любой неизвестный GET уходит в index.html.
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api')) {
      return reply.code(404).send({ error: 'not_found' })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return reply.code(405).send({ error: 'method_not_allowed' })
    }
    return sendStatic(config.webDist, req.url, reply)
  })

  app.server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0]
    if (path === '/ws') {
      realtime.handleUpgrade(req, socket, head)
      return
    }
    socket.destroy()
  })

  const stopSweeper = manager.startSweeper(30_000)
  const stopPruner = setInterval(() => createLimiter.prune(), CREATE_WINDOW_MS)
  if (typeof stopPruner.unref === 'function') stopPruner.unref()

  await app.listen({ port: config.port, host: config.host })
  app.log.info({ port: config.port, webDist: config.webDist }, 'scrum-poker listening')

  let closing = false
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return
    closing = true
    app.log.info({ signal }, 'shutting down')
    clearInterval(stopPruner)
    stopSweeper()
    await realtime.close()
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('unhandledRejection', (reason) => {
    app.log.error({ reason }, 'unhandled rejection')
  })
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
