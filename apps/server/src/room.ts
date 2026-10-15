import { randomUUID } from 'node:crypto'
import type {
  Card,
  ErrorCode,
  JoinedMessage,
  ParticipantView,
  Phase,
  RevealPayload,
  ServerMessage,
} from '@scrum-poker/shared'
import {
  isCard,
  isNicknameValid,
  MAX_PARTICIPANTS,
  normalizeNickname,
  normalizeRoomCode,
} from '@scrum-poker/shared'
import { generateRoomCode } from './code.js'
import { SlidingWindowLimiter } from './limits.js'
import { computeStats } from './stats.js'

/** Максимум одновременно живых комнат (NFR-6). */
export const MAX_ROOMS = 50
/** Сколько держим отключившегося участника, чтобы он мог вернуться (FR-08). */
export const DISCONNECT_GRACE_MS = 60_000
/** Когда удалять комнату без единого участника / без подключений (сек. 6). */
export const ROOM_IDLE_TTL_MS = 10 * 60_000
/** Абсолютный срок жизни комнаты. */
export const ROOM_MAX_AGE_MS = 12 * 60 * 60_000
/** Неудачных попыток входа в одну комнату в минуту (NFR-6). */
export const JOIN_LIMIT_PER_ROOM = 10
export const JOIN_LIMIT_WINDOW_MS = 60_000

export interface Participant {
  id: string
  nickname: string
  connected: boolean
  connId: string | null
  joinedAt: number
  disconnectedAt: number | null
  /** Голос живёт в комнате, а не в соединении — переподключение его сохраняет. */
  vote: Card | null
}

export interface Room {
  code: string
  createdAt: number
  lastConnectedAt: number
  hostId: string | null
  phase: Phase
  participants: Map<string, Participant>
}

export interface RoomHooks {
  /** Доставить сообщение конкретному открытому соединению. */
  writeTo(connId: string, msg: ServerMessage): void
  /** Отложенное выполнение; возвращает отмену. */
  schedule(fn: () => void, ms: number): () => void
}

export type JoinResult =
  { ok: true; joined: JoinedMessage } | { ok: false; code: ErrorCode; message: string }

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly byConn = new Map<string, { code: string; participantId: string }>()
  private readonly graceCancels = new Map<string, () => void>()
  private readonly joinLimiter = new SlidingWindowLimiter(JOIN_LIMIT_PER_ROOM, JOIN_LIMIT_WINDOW_MS)

  constructor(private readonly hooks: RoomHooks) {}

  /* ------------------------------ комнаты ------------------------------ */

  createRoom(now: number = Date.now()): string | null {
    if (this.rooms.size >= MAX_ROOMS) return null

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = generateRoomCode()
      if (this.rooms.has(code)) continue
      this.rooms.set(code, {
        code,
        createdAt: now,
        lastConnectedAt: now,
        hostId: null,
        phase: 'voting',
        participants: new Map(),
      })
      return code
    }
    return null
  }

  hasRoom(rawCode: string): boolean {
    return this.rooms.has(normalizeRoomCode(rawCode))
  }

  stats(): { rooms: number; participants: number; connected: number } {
    let participants = 0
    let connected = 0
    for (const room of this.rooms.values()) {
      for (const p of room.participants.values()) {
        participants += 1
        if (p.connected) connected += 1
      }
    }
    return { rooms: this.rooms.size, participants, connected }
  }

  /* -------------------------------- вход ------------------------------- */

  join(connId: string, rawRoom: string, rawNickname: string): JoinResult {
    const code = normalizeRoomCode(rawRoom)
    const room = this.rooms.get(code)
    if (!room) {
      return this.failJoin(code, 'not_found', 'Комната не найдена')
    }

    const nickname = normalizeNickname(rawNickname)
    if (!isNicknameValid(nickname)) {
      return this.failJoin(code, 'bad_nickname', 'Укажите ник (1–24 символа)')
    }

    const existing = [...room.participants.values()].find((p) => p.nickname === nickname)
    if (existing) {
      if (existing.connected) {
        return this.failJoin(code, 'nick_taken', 'Ник уже занят')
      }
      this.rebind(room, existing, connId)
      return { ok: true, joined: this.buildJoined(room, existing) }
    }

    if (room.participants.size >= MAX_PARTICIPANTS) {
      return this.failJoin(
        code,
        'room_full',
        `Комната заполнена (максимум ${MAX_PARTICIPANTS} человек)`,
      )
    }

    const participant: Participant = {
      id: randomUUID(),
      nickname,
      connected: true,
      connId,
      joinedAt: Date.now(),
      disconnectedAt: null,
      vote: null,
    }

    room.participants.set(participant.id, participant)
    this.byConn.set(connId, { code: room.code, participantId: participant.id })
    room.lastConnectedAt = Date.now()
    if (room.hostId === null) room.hostId = participant.id

    const joined = this.buildJoined(room, participant)
    this.broadcast(room, this.stateMessage(room), participant.id)
    return { ok: true, joined }
  }

  /* ------------------------------ голосование ------------------------- */

  vote(connId: string, card: unknown): void {
    const ctx = this.context(connId)
    if (!ctx) return

    if (ctx.room.phase !== 'voting') {
      return this.fail(connId, 'forbidden', 'Карты уже вскрыты. Дождитесь сброса.')
    }
    if (!isCard(card)) {
      return this.fail(connId, 'bad_payload', 'Неизвестная карта')
    }

    ctx.participant.vote = card
    this.write(connId, { t: 'vote_ack', card })
    // Широковещательно, включая автора: иначе у него в списке участников
    // остаётся «не проголосовал» и счётчик занижается.
    this.broadcast(ctx.room, { t: 'voted', id: ctx.participant.id, voted: true })
  }

  unvote(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return

    if (ctx.room.phase !== 'voting') {
      return this.fail(connId, 'forbidden', 'Карты уже вскрыты. Дождитесь сброса.')
    }

    ctx.participant.vote = null
    this.write(connId, { t: 'vote_ack', card: null })
    this.broadcast(ctx.room, { t: 'voted', id: ctx.participant.id, voted: false })
  }

  /* -------------------------------- раунд ------------------------------ */

  reveal(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return
    if (ctx.room.hostId !== ctx.participant.id) {
      return this.fail(connId, 'forbidden', 'Только ведущий может вскрывать карты')
    }

    ctx.room.phase = 'revealed'
    this.broadcast(ctx.room, { t: 'revealed', reveal: this.buildReveal(ctx.room) })
  }

  reset(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return
    if (ctx.room.hostId !== ctx.participant.id) {
      return this.fail(connId, 'forbidden', 'Только ведущий может сбрасывать карты')
    }

    ctx.room.phase = 'voting'
    for (const p of ctx.room.participants.values()) p.vote = null
    this.broadcast(ctx.room, { t: 'reset' })
    this.broadcast(ctx.room, this.stateMessage(ctx.room))
  }

  takeHost(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return
    if (ctx.room.hostId === ctx.participant.id) return

    ctx.room.hostId = ctx.participant.id
    this.broadcast(ctx.room, this.stateMessage(ctx.room))
  }

  /* --------------------------- выход/обрыв ----------------------------- */

  leave(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return
    this.removeParticipant(ctx.room, ctx.participant, true)
  }

  disconnect(connId: string): void {
    const ctx = this.context(connId)
    if (!ctx) return

    const { room, participant } = ctx
    this.byConn.delete(connId)
    participant.connected = false
    participant.connId = null
    participant.disconnectedAt = Date.now()

    // Роль ведущего сразу освобождается — любой может забрать её (FR-07).
    if (room.hostId === participant.id) room.hostId = null

    this.broadcast(room, this.stateMessage(room))

    const roomId = room.code
    const participantId = participant.id
    this.scheduleCancel(
      participantId,
      this.hooks.schedule(() => {
        this.graceCancels.delete(participantId)
        const current = this.rooms.get(roomId)
        if (!current) return
        const still = current.participants.get(participantId)
        if (still && !still.connected) this.removeParticipant(current, still, true)
      }, DISCONNECT_GRACE_MS),
    )
  }

  /* ------------------------------ housekeeping ------------------------- */

  cleanup(now: number = Date.now()): void {
    for (const room of [...this.rooms.values()]) {
      if (now - room.createdAt > ROOM_MAX_AGE_MS) {
        this.deleteRoom(room)
        continue
      }

      let anyConnected = false
      for (const p of room.participants.values()) {
        if (p.connected) {
          anyConnected = true
          break
        }
      }

      // Комната только создана и в неё ещё никто не заходил — живёт дольше.
      const sinceLastPresence =
        room.participants.size === 0 ? now - room.createdAt : now - room.lastConnectedAt
      if (!anyConnected && sinceLastPresence > ROOM_IDLE_TTL_MS) this.deleteRoom(room)
    }

    this.joinLimiter.prune(now)
  }

  /** Периодический тик housekeeping. Возвращает функцию остановки. */
  startSweeper(intervalMs: number): () => void {
    const timer = setInterval(() => this.cleanup(), intervalMs)
    if (typeof timer.unref === 'function') timer.unref()
    return () => clearInterval(timer)
  }

  /* ------------------------------- internals --------------------------- */

  /** Неудачные попытки входа ограничены; успешные — нет (см. ТЗ, NFR-6). */
  private failJoin(roomCode: string, code: ErrorCode, message: string): JoinResult {
    if (!this.joinLimiter.allow(roomCode)) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Слишком много неудачных попыток входа. Подождите минуту.',
      }
    }
    return { ok: false, code, message }
  }

  private context(connId: string): { room: Room; participant: Participant } | null {
    const ref = this.byConn.get(connId)
    if (!ref) return null

    const room = this.rooms.get(ref.code)
    if (!room) {
      this.byConn.delete(connId)
      return null
    }

    const participant = room.participants.get(ref.participantId)
    if (!participant) {
      this.byConn.delete(connId)
      return null
    }

    return { room, participant }
  }

  private rebind(room: Room, participant: Participant, connId: string): void {
    this.cancelGrace(participant.id)

    participant.connected = true
    participant.connId = connId
    participant.disconnectedAt = null

    this.byConn.set(connId, { code: room.code, participantId: participant.id })
    room.lastConnectedAt = Date.now()
    if (room.hostId === null) room.hostId = participant.id

    this.broadcast(room, this.stateMessage(room))
  }

  private removeParticipant(room: Room, participant: Participant, announce: boolean): void {
    this.cancelGrace(participant.id)

    if (participant.connId) this.byConn.delete(participant.connId)
    room.participants.delete(participant.id)

    if (room.hostId === participant.id) room.hostId = null

    if (room.participants.size === 0) {
      this.deleteRoom(room)
      return
    }

    if (announce) this.broadcast(room, this.stateMessage(room))
  }

  private deleteRoom(room: Room): void {
    for (const p of room.participants.values()) {
      this.cancelGrace(p.id)
      if (p.connId) this.byConn.delete(p.connId)
    }
    this.rooms.delete(room.code)
  }

  private cancelGrace(participantId: string): void {
    const cancel = this.graceCancels.get(participantId)
    if (cancel) {
      cancel()
      this.graceCancels.delete(participantId)
    }
  }

  private scheduleCancel(participantId: string, cancel: () => void): void {
    this.cancelGrace(participantId)
    this.graceCancels.set(participantId, cancel)
  }

  private write(connId: string, msg: ServerMessage): void {
    this.hooks.writeTo(connId, msg)
  }

  private broadcast(room: Room, msg: ServerMessage, exceptParticipantId?: string): void {
    for (const p of room.participants.values()) {
      if (exceptParticipantId && p.id === exceptParticipantId) continue
      if (p.connId) this.write(p.connId, msg)
    }
  }

  private fail(connId: string, code: ErrorCode, message: string): void {
    this.write(connId, { t: 'error', code, message })
  }

  private views(room: Room): ParticipantView[] {
    return [...room.participants.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      connected: p.connected,
      isHost: p.id === room.hostId,
      voted: p.vote !== null,
    }))
  }

  private stateMessage(room: Room): ServerMessage {
    return {
      t: 'state',
      participants: this.views(room),
      hostId: room.hostId,
      phase: room.phase,
    }
  }

  private buildReveal(room: Room): RevealPayload {
    const votes = [...room.participants.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      card: p.vote,
    }))
    const cards = votes.flatMap((v) => (v.card === null ? [] : [v.card]))
    return { votes, stats: computeStats(cards, room.participants.size) }
  }

  private buildJoined(room: Room, participant: Participant): JoinedMessage {
    return {
      t: 'joined',
      selfId: participant.id,
      room: room.code,
      phase: room.phase,
      participants: this.views(room),
      hostId: room.hostId,
      yourCard: participant.vote,
      reveal: room.phase === 'revealed' ? this.buildReveal(room) : null,
    }
  }
}
