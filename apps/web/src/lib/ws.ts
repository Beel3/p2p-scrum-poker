import type { ClientMessage, ServerMessage } from '@scrum-poker/shared'

export type Status = 'idle' | 'connecting' | 'open' | 'closed'

const PING_INTERVAL_MS = 25_000
const BACKOFF_MS = [500, 1000, 2000, 5000] as const

type MessageListener = (msg: ServerMessage) => void
type StatusListener = (status: Status) => void

/**
 * Обёртка над WebSocket: реконнект с нарастающей паузой, heartbeat и
 * рассылка сообщений подписчикам. Подключение управляется приложением —
 * сервер сам перепривязывает участника по нику (ТЗ, FR-08).
 */
export class WsClient {
  private ws: WebSocket | null = null
  private enabled = false
  private attempts = 0
  private connectTimer: number | null = null
  private pingTimer: number | null = null
  private awaitingPong = false
  private status: Status = 'idle'

  private readonly messageListeners = new Set<MessageListener>()
  private readonly statusListeners = new Set<StatusListener>()

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  start(): void {
    if (this.enabled) return
    this.enabled = true
    this.attempts = 0
    this.open()
  }

  stop(): void {
    this.enabled = false
    this.clearTimers()
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.setStatus('idle')
  }

  get currentStatus(): Status {
    return this.status
  }

  /** false — соединения нет, сообщение отброшено. */
  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  private setStatus(next: Status): void {
    if (this.status === next) return
    this.status = next
    for (const listener of this.statusListeners) listener(next)
  }

  private url(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }

  private open(): void {
    if (!this.enabled) return

    this.setStatus('connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(this.url())
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.attempts = 0
      this.setStatus('open')
      this.startPing()
    }

    ws.onmessage = (event: MessageEvent) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      if (msg.t === 'pong') {
        this.awaitingPong = false
        return
      }
      for (const listener of this.messageListeners) listener(msg)
    }

    ws.onclose = () => {
      this.stopPing()
      if (this.ws === ws) this.ws = null
      if (!this.enabled) return
      this.setStatus('closed')
      this.scheduleReconnect()
    }

    // onerror не используется: close придёт следом и обработает восстановление.
    ws.onerror = () => undefined
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.connectTimer !== null) return
    const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)] ?? 5000
    this.attempts += 1
    this.connectTimer = window.setTimeout(() => {
      this.connectTimer = null
      this.open()
    }, delay)
  }

  private startPing(): void {
    this.stopPing()
    this.awaitingPong = false
    this.pingTimer = window.setInterval(() => {
      if (this.awaitingPong) {
        // Два интервала без ответа — соединение мертво, форсируем реконнект.
        this.ws?.close()
        return
      }
      this.awaitingPong = true
      this.send({ t: 'ping' })
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    this.awaitingPong = false
  }

  private clearTimers(): void {
    this.stopPing()
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }
}
