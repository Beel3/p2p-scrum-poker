import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { ClientMessageSchema, type ErrorCode, type ServerMessage } from '@scrum-poker/shared'
import { Buffer } from 'node:buffer'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { RoomManager, type RoomHooks } from './room.js'

/** Клиентский heartbeat (ТЗ, раздел 7). */
const HEARTBEAT_INTERVAL_MS = 25_000
/** Максимальный размер входящего сообщения. */
const MAX_PAYLOAD_BYTES = 2048

interface Conn {
  socket: WebSocket
  /** false — мы отправили ping и ещё не получили pong. */
  alive: boolean
}

/** ws отдаёт Buffer | Buffer[] | ArrayBuffer — приводим к строке. */
function toText(data: RawData): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data as ArrayBuffer).toString('utf8')
}

export interface Realtime {
  manager: RoomManager
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
  close(): Promise<void>
}

/**
 * Создаёт WebSocket-слой вместе с менеджером комнат: слой владеет
 * сокетами, менеджер — состоянием, связь идёт через RoomHooks.
 */
export function createRealtime(): Realtime {
  const conns = new Map<string, Conn>()

  const writeTo = (connId: string, msg: ServerMessage): void => {
    const conn = conns.get(connId)
    if (!conn || conn.socket.readyState !== WebSocket.OPEN) return
    conn.socket.send(JSON.stringify(msg))
  }

  const schedule = (fn: () => void, ms: number): (() => void) => {
    const timer = setTimeout(fn, ms)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearTimeout(timer)
  }

  const hooks: RoomHooks = { writeTo, schedule }
  const manager = new RoomManager(hooks)

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })

  const error = (connId: string, code: ErrorCode, message: string): void => {
    writeTo(connId, { t: 'error', code, message })
  }

  const dispatch = (connId: string, raw: unknown): void => {
    const parsed = ClientMessageSchema.safeParse(raw)
    if (!parsed.success) {
      error(connId, 'bad_payload', 'Некорректное сообщение')
      return
    }

    const msg = parsed.data
    switch (msg.t) {
      case 'join': {
        const result = manager.join(connId, msg.room, msg.nickname)
        if (result.ok) writeTo(connId, result.joined)
        else writeTo(connId, { t: 'error', code: result.code, message: result.message })
        break
      }
      case 'vote':
        manager.vote(connId, msg.card)
        break
      case 'unvote':
        manager.unvote(connId)
        break
      case 'reveal':
        manager.reveal(connId)
        break
      case 'reset':
        manager.reset(connId)
        break
      case 'take_host':
        manager.takeHost(connId)
        break
      case 'leave':
        manager.leave(connId)
        break
      case 'ping':
        writeTo(connId, { t: 'pong' })
        break
      default: {
        const never: never = msg
        void never
      }
    }
  }

  wss.on('connection', (socket: WebSocket) => {
    const connId = randomUUID()
    const conn: Conn = { socket, alive: true }
    conns.set(connId, conn)

    socket.on('pong', () => {
      conn.alive = true
    })

    socket.on('message', (data) => {
      const text = toText(data)
      if (Buffer.byteLength(text, 'utf8') > MAX_PAYLOAD_BYTES) {
        error(connId, 'bad_payload', 'Слишком большое сообщение')
        return
      }
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        error(connId, 'bad_payload', 'Некорректный JSON')
        return
      }
      dispatch(connId, payload)
    })

    socket.on('error', () => {
      socket.terminate()
    })

    socket.on('close', () => {
      conns.delete(connId)
      manager.disconnect(connId)
    })
  })

  // Терминируем мёртвые соединения (обнаружение на уровне протокола).
  const heartbeat = setInterval(() => {
    for (const conn of conns.values()) {
      if (conn.socket.readyState !== WebSocket.OPEN) continue
      if (!conn.alive) {
        conn.socket.terminate()
        continue
      }
      conn.alive = false
      conn.socket.ping()
    }
  }, HEARTBEAT_INTERVAL_MS)
  if (typeof heartbeat.unref === 'function') heartbeat.unref()

  return {
    manager,
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    },
    async close() {
      clearInterval(heartbeat)
      for (const conn of conns.values()) conn.socket.terminate()
      conns.clear()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    },
  }
}
