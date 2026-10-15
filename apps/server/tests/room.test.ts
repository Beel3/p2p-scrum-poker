import { describe, expect, it } from 'vitest'
import type { JoinedMessage, ServerMessage } from '@scrum-poker/shared'
import { MAX_PARTICIPANTS } from '@scrum-poker/shared'
import { DISCONNECT_GRACE_MS, JOIN_LIMIT_PER_ROOM, MAX_ROOMS, RoomManager } from '../src/room.js'

interface Harness {
  manager: RoomManager
  sent: Array<{ connId: string; msg: ServerMessage }>
  messagesFor(connId: string): ServerMessage[]
  errorsFor(connId: string): ServerMessage[]
  /** Последнее сообщение типа state, доставленное соединению. */
  lastStateFor(connId: string): Extract<ServerMessage, { t: 'state' }>
  flushTimers(): void
  clear(): void
}

function createHarness(): Harness {
  const sent: Array<{ connId: string; msg: ServerMessage }> = []
  let pending: Array<() => void> = []

  const manager = new RoomManager({
    writeTo: (connId, msg) => {
      sent.push({ connId, msg })
    },
    schedule: (fn) => {
      pending.push(fn)
      return () => {
        pending = pending.filter((f) => f !== fn)
      }
    },
  })

  return {
    manager,
    sent,
    messagesFor: (connId) => sent.filter((s) => s.connId === connId).map((s) => s.msg),
    errorsFor: (connId) =>
      sent.filter((s) => s.connId === connId && s.msg.t === 'error').map((s) => s.msg),
    lastStateFor: (connId) => {
      const states = sent.filter(
        (s): s is { connId: string; msg: Extract<ServerMessage, { t: 'state' }> } =>
          s.connId === connId && s.msg.t === 'state',
      )
      const last = states.at(-1)
      if (!last) throw new Error(`нет state для ${connId}`)
      return last.msg
    },
    flushTimers: () => {
      const batch = pending
      pending = []
      for (const fn of batch) fn()
    },
    clear: () => {
      sent.length = 0
    },
  }
}

function joinOk(h: Harness, connId: string, room: string, nickname: string): JoinedMessage {
  const result = h.manager.join(connId, room, nickname)
  if (!result.ok) throw new Error(`join failed: ${result.code} — ${result.message}`)
  return result.joined
}

/** Создаёт комнату и заводит в ней ведущего на conn "host". */
function seed(h: Harness, nickname = 'Ведущий'): { code: string; joined: JoinedMessage } {
  const code = h.manager.createRoom()
  if (!code) throw new Error('не удалось создать комнату')
  const joined = joinOk(h, 'host', code, nickname)
  h.clear()
  return { code, joined }
}

/* ------------------------------------------------------------------ */

describe('вход в комнату', () => {
  it('первый вошедший становится ведущим', () => {
    const h = createHarness()
    const { joined } = seed(h)
    expect(joined.hostId).toBe(joined.selfId)
    expect(joined.phase).toBe('voting')
    expect(joined.participants).toHaveLength(1)
    expect(joined.participants[0]?.isHost).toBe(true)
  })

  it('возвращает код комнаты, колоду-статус и пустой голос', () => {
    const h = createHarness()
    const { joined } = seed(h)
    expect(joined.room).toHaveLength(6)
    expect(joined.yourCard).toBeNull()
    expect(joined.reveal).toBeNull()
  })

  it('незнакомый код → not_found', () => {
    const h = createHarness()
    const res = h.manager.join('x', 'ZZZZZZ', 'Аня')
    expect(res).toMatchObject({ ok: false, code: 'not_found' })
  })

  it('код нормализуется: регистр и дефисы не мешают', () => {
    const h = createHarness()
    const { code } = seed(h)
    const lower = code.toLowerCase()
    const res = h.manager.join('second', lower, 'Второй')
    expect(res.ok).toBe(true)
    expect(h.errorsFor('second')).toHaveLength(0)
  })

  it('занятый ник → nick_taken', () => {
    const h = createHarness()
    const { code } = seed(h, 'Аня')
    const res = h.manager.join('other', code, 'Аня')
    expect(res).toMatchObject({ ok: false, code: 'nick_taken' })
  })

  it('пустой или слишком длинный ник → bad_nickname', () => {
    const h = createHarness()
    const { code } = seed(h)
    expect(h.manager.join('a', code, '   ')).toMatchObject({ code: 'bad_nickname' })
    expect(h.manager.join('a', code, 'x'.repeat(25))).toMatchObject({ code: 'bad_nickname' })
  })

  it('17-й участник → room_full, при этом 16 успевают войти', () => {
    const h = createHarness()
    const { code } = seed(h)

    for (let i = 1; i < MAX_PARTICIPANTS; i += 1) {
      const res = h.manager.join(`c${i}`, code, `user-${i}`)
      expect(res.ok).toBe(true)
    }

    const overflow = h.manager.join('c17', code, 'user-17')
    expect(overflow).toMatchObject({ ok: false, code: 'room_full' })
    expect(h.manager.stats().participants).toBe(MAX_PARTICIPANTS)
  })

  it('лимит действует только на неудачные попытки', () => {
    const h = createHarness()
    const { code } = seed(h)

    for (let i = 0; i < JOIN_LIMIT_PER_ROOM; i += 1) {
      const res = h.manager.join('brute', code, 'x'.repeat(30))
      expect(res.ok).toBe(false)
      expect(res.ok === false && res.code).toBe('bad_nickname')
    }

    const limited = h.manager.join('brute', code, 'x'.repeat(30))
    expect(limited).toMatchObject({ ok: false, code: 'rate_limited' })

    // Успешный вход при этом не блокируется.
    const ok = h.manager.join('legit', code, 'Нормальный')
    expect(ok.ok).toBe(true)
  })
})

/* ------------------------------------------------------------------ */

describe('голосование', () => {
  it('автору уходит подтверждение с картой, остальным — только флаг', () => {
    const h = createHarness()
    const { code, joined } = seed(h)
    const second = joinOk(h, 'second', code, 'Второй')
    h.clear()

    h.manager.vote('host', 8)
    h.manager.vote('second', 3)

    // Автор получает подтверждение со своим выбором.
    expect(h.messagesFor('host')).toContainEqual({ t: 'vote_ack', card: 8 })
    expect(h.messagesFor('second')).toContainEqual({ t: 'vote_ack', card: 3 })

    // Остальным уходит только флаг «проголосовал» — без значения.
    expect(h.messagesFor('second')).toContainEqual({
      t: 'voted',
      id: joined.selfId,
      voted: true,
    })
    expect(h.messagesFor('host')).toContainEqual({
      t: 'voted',
      id: second.selfId,
      voted: true,
    })

    // Ни одно широковещательное сообщение не несёт карты.
    for (const connId of ['host', 'second']) {
      const broadcast = h.messagesFor(connId).filter((m) => m.t !== 'vote_ack')
      expect(broadcast.some((m) => 'card' in m)).toBe(false)
    }
  })

  it('повторный выбор заменяет голос, отмена снимает его', () => {
    const h = createHarness()
    seed(h)
    h.clear()

    h.manager.vote('host', 3)
    expect(h.messagesFor('host')).toContainEqual({ t: 'vote_ack', card: 3 })

    h.manager.vote('host', 5)
    expect(h.messagesFor('host')).toContainEqual({ t: 'vote_ack', card: 5 })
    expect(h.messagesFor('host').filter((m) => m.t === 'vote_ack')).toHaveLength(2)

    h.manager.unvote('host')
    expect(h.messagesFor('host')).toContainEqual({ t: 'vote_ack', card: null })
  })

  it('автор тоже получает свой флаг voted — иначе занижается счётчик', () => {
    const h = createHarness()
    const { joined } = seed(h)
    h.clear()

    h.manager.vote('host', 8)
    expect(h.messagesFor('host')).toContainEqual({
      t: 'voted',
      id: joined.selfId,
      voted: true,
    })

    h.manager.unvote('host')
    expect(h.messagesFor('host')).toContainEqual({
      t: 'voted',
      id: joined.selfId,
      voted: false,
    })
  })

  it('значение вне колоды → bad_payload', () => {
    const h = createHarness()
    seed(h)
    h.clear()
    h.manager.vote('host', 11)
    expect(h.errorsFor('host')).toContainEqual(
      expect.objectContaining({ t: 'error', code: 'bad_payload' }),
    )
    expect(h.messagesFor('host').some((m) => m.t === 'vote_ack')).toBe(false)
  })

  it('голос от неизвестного соединения игнорируется', () => {
    const h = createHarness()
    seed(h)
    h.clear()
    h.manager.vote('ghost', 5)
    expect(h.sent).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ */

describe('вскрытие и сброс', () => {
  it('вскрытие доступно только ведущему', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.clear()

    h.manager.reveal('second')
    expect(h.errorsFor('second')).toContainEqual(expect.objectContaining({ code: 'forbidden' }))
  })

  it('после вскрытия всем видны поимённые голоса и сводка', () => {
    const h = createHarness()
    const { code, joined } = seed(h)
    const second = joinOk(h, 'second', code, 'Второй')
    h.manager.vote('host', 8)
    h.manager.vote('second', 3)
    h.clear()

    h.manager.reveal('host')

    const msg = h.messagesFor('second').find((m) => m.t === 'revealed')
    expect(msg).toBeDefined()
    if (!msg || msg.t !== 'revealed') throw new Error('нет revealed')

    expect(msg.reveal.votes).toEqual([
      { id: joined.selfId, nickname: 'Ведущий', card: 8 },
      { id: second.selfId, nickname: 'Второй', card: 3 },
    ])
    expect(msg.reveal.stats).toEqual({
      evaluated: 2,
      total: 2,
      median: 5.5,
      mean: 5.5,
      min: 3,
      max: 8,
    })
  })

  it('не голосовавшие попадают в таблицу с card: null', () => {
    const h = createHarness()
    const { code, joined } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.manager.vote('host', 5)
    h.clear()

    h.manager.reveal('host')

    const msg = h.messagesFor('host').find((m) => m.t === 'revealed')
    if (!msg || msg.t !== 'revealed') throw new Error('нет revealed')
    expect(msg.reveal.votes).toContainEqual({
      id: joined.selfId,
      nickname: 'Ведущий',
      card: 5,
    })
    expect(msg.reveal.votes.find((v) => v.nickname === 'Второй')?.card).toBeNull()
    expect(msg.reveal.stats.evaluated).toBe(1)
    expect(msg.reveal.stats.total).toBe(2)
  })

  it('вскрытие допустимо, даже если никто не голосовал', () => {
    const h = createHarness()
    seed(h)
    h.clear()
    h.manager.reveal('host')
    const msg = h.messagesFor('host').find((m) => m.t === 'revealed')
    if (!msg || msg.t !== 'revealed') throw new Error('нет revealed')
    expect(msg.reveal.stats.evaluated).toBe(0)
    expect(msg.reveal.stats.median).toBeNull()
  })

  it('после вскрытия новый участник получает результат сразу', () => {
    const h = createHarness()
    const { code } = seed(h)
    h.manager.vote('host', 8)
    h.manager.reveal('host')
    h.clear()

    const late = joinOk(h, 'late', code, 'Опоздавший')
    expect(late.phase).toBe('revealed')
    expect(late.reveal?.stats.total).toBe(2)
    expect(late.reveal?.votes).toHaveLength(2)
  })

  it('в фазе revealed голосовать нельзя', () => {
    const h = createHarness()
    seed(h)
    h.manager.reveal('host')
    h.clear()

    h.manager.vote('host', 3)
    expect(h.errorsFor('host')).toContainEqual(expect.objectContaining({ code: 'forbidden' }))
  })

  it('сброс стирает голоса и возвращает фазу voting', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.manager.vote('host', 8)
    h.manager.vote('second', 3)
    h.manager.reveal('host')
    h.clear()

    h.manager.reset('host')

    expect(h.messagesFor('second').some((m) => m.t === 'reset')).toBe(true)
    const state = h.lastStateFor('second')
    expect(state.phase).toBe('voting')
    expect(state.participants.every((p) => !p.voted)).toBe(true)

    // Голоса действительно стёрты: следующее вскрытие пустое.
    h.manager.reveal('host')
    const again = h.messagesFor('second').find((m) => m.t === 'revealed')
    if (!again || again.t !== 'revealed') throw new Error('нет revealed')
    expect(again.reveal.stats.evaluated).toBe(0)
    expect(again.reveal.votes.every((v) => v.card === null)).toBe(true)
  })

  it('сброс недоступен не ведущему', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.clear()
    h.manager.reset('second')
    expect(h.errorsFor('second')).toContainEqual(expect.objectContaining({ code: 'forbidden' }))
  })
})

/* ------------------------------------------------------------------ */

describe('роли, отключение, переподключение', () => {
  it('любой участник может забрать роль ведущего', () => {
    const h = createHarness()
    const { code, joined } = seed(h)
    const second = joinOk(h, 'second', code, 'Второй')

    h.manager.takeHost('second')

    const state = h.lastStateFor('host')
    expect(state.hostId).toBe(second.selfId)
    expect(state.participants.find((p) => p.id === joined.selfId)?.isHost).toBe(false)
  })

  it('отключение ведущего сразу освобождает роль', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.clear()

    h.manager.disconnect('host')

    const state = h.lastStateFor('second')
    expect(state.hostId).toBeNull()
    expect(state.participants.find((p) => p.nickname === 'Ведущий')?.connected).toBe(false)
  })

  it('переподключение сохраняет голос и идентификатор', () => {
    const h = createHarness()
    const { code, joined } = seed(h)
    h.manager.vote('host', 8)
    h.clear()

    h.manager.disconnect('host')
    const reconnected = joinOk(h, 'host-again', code, 'Ведущий')

    expect(reconnected.selfId).toBe(joined.selfId)
    expect(reconnected.yourCard).toBe(8)
    expect(reconnected.hostId).toBe(joined.selfId)
  })

  it('после grace-периода отключённый удаляется', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')
    h.clear()

    h.manager.disconnect('host')
    expect(h.manager.stats().participants).toBe(2)

    expect(DISCONNECT_GRACE_MS).toBe(60_000)
    h.flushTimers()

    expect(h.manager.stats().participants).toBe(1)
    expect(h.lastStateFor('second').participants).toHaveLength(1)
  })

  it('возврат в течение grace-периода отменяет удаление', () => {
    const h = createHarness()
    const { code } = seed(h)
    joinOk(h, 'second', code, 'Второй')

    h.manager.disconnect('host')
    joinOk(h, 'back', code, 'Ведущий')
    h.flushTimers()

    expect(h.manager.stats().participants).toBe(2)
    expect(h.manager.stats().connected).toBe(2)
  })

  it('выход последнего участника удаляет комнату', () => {
    const h = createHarness()
    const { code } = seed(h)
    h.manager.leave('host')
    expect(h.manager.hasRoom(code)).toBe(false)
  })

  it('явный выход убирает участника и объявляет об этом остальным', () => {
    const h = createHarness()
    const { code, joined: host } = seed(h)
    const second = joinOk(h, 'second', code, 'Второй')
    h.clear()

    h.manager.leave('second')

    const state = h.lastStateFor('host')
    expect(state.participants).toHaveLength(1)
    expect(state.participants[0]?.id).toBe(host.selfId)
    expect(state.participants[0]?.id).not.toBe(second.selfId)
  })
})

/* ------------------------------------------------------------------ */

describe('housekeeping', () => {
  it('лимит комнат соблюдается', () => {
    const h = createHarness()
    for (let i = 0; i < MAX_ROOMS; i += 1) expect(h.manager.createRoom()).not.toBeNull()
    expect(h.manager.createRoom()).toBeNull()
  })

  it('комната без подключений удаляется по истечении TTL', () => {
    const h = createHarness()
    const code = h.manager.createRoom()
    if (!code) throw new Error('нет комнаты')

    const created = Date.now()
    h.manager.cleanup(created + 5 * 60_000)
    expect(h.manager.hasRoom(code)).toBe(true)

    h.manager.cleanup(created + 11 * 60_000)
    expect(h.manager.hasRoom(code)).toBe(false)
  })

  it('живая комната не удаляется по TTL', () => {
    const h = createHarness()
    const { code } = seed(h)
    h.manager.cleanup(Date.now() + 11 * 60_000)
    expect(h.manager.hasRoom(code)).toBe(true)
  })

  it('комната не удаляется раньше, чем в неё успели войти', () => {
    const h = createHarness()
    const code = h.manager.createRoom()
    if (!code) throw new Error('нет комнаты')
    h.manager.cleanup(Date.now() + 60_000)
    expect(h.manager.hasRoom(code)).toBe(true)
  })
})
