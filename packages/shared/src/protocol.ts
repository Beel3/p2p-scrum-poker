import { z } from 'zod'
import { NICK_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from './deck.js'
import type { Card } from './deck.js'

/* ------------------------------------------------------------------ */
/*  Домен                                                             */
/* ------------------------------------------------------------------ */

export type Phase = 'voting' | 'revealed'

export type ErrorCode =
  | 'nick_taken'
  | 'room_full'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'bad_payload'
  | 'bad_nickname'

/** Проекция участника, рассылаемая всем клиентам комнаты. */
export interface ParticipantView {
  id: string
  nickname: string
  connected: boolean
  isHost: boolean
  /** true — карта выбрана. Само значение до вскрытия не передаётся. */
  voted: boolean
}

export interface Stats {
  /** Сколько голосов учтено в расчёте. */
  evaluated: number
  /** Сколько участников в комнате. */
  total: number
  median: number | null
  mean: number | null
  min: number | null
  max: number | null
}

export interface RevealVote {
  id: string
  nickname: string
  /** null — участник не голосовал. */
  card: Card | null
}

export interface RevealPayload {
  votes: RevealVote[]
  stats: Stats
}

/* ------------------------------------------------------------------ */
/*  Сообщения клиент → сервер                                         */
/* ------------------------------------------------------------------ */

const joinSchema = z.object({
  t: z.literal('join'),
  room: z.string().min(1).max(64),
  nickname: z.string().min(1).max(128),
})

const voteSchema = z.object({
  t: z.literal('vote'),
  card: z.unknown(),
})

const unvoteSchema = z.object({ t: z.literal('unvote') })
const revealSchema = z.object({ t: z.literal('reveal') })
const resetSchema = z.object({ t: z.literal('reset') })
const takeHostSchema = z.object({ t: z.literal('take_host') })
const leaveSchema = z.object({ t: z.literal('leave') })
const pingSchema = z.object({ t: z.literal('ping') })

export const ClientMessageSchema = z.discriminatedUnion('t', [
  joinSchema,
  voteSchema,
  unvoteSchema,
  revealSchema,
  resetSchema,
  takeHostSchema,
  leaveSchema,
  pingSchema,
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>

/* ------------------------------------------------------------------ */
/*  Сообщения сервер → клиент                                         */
/* ------------------------------------------------------------------ */

export interface JoinedMessage {
  t: 'joined'
  selfId: string
  room: string
  phase: Phase
  participants: ParticipantView[]
  hostId: string | null
  /** Собственный голос (виден только адресату). */
  yourCard: Card | null
  /** Заполнено, если комната уже в фазе revealed. */
  reveal: RevealPayload | null
}

export interface StateMessage {
  t: 'state'
  participants: ParticipantView[]
  hostId: string | null
  phase: Phase
}

export interface VoteAckMessage {
  t: 'vote_ack'
  card: Card | null
}

export interface VotedMessage {
  t: 'voted'
  id: string
  voted: boolean
}

export interface RevealedMessage {
  t: 'revealed'
  reveal: RevealPayload
}

export interface ResetMessage {
  t: 'reset'
}

export interface ErrorMessage {
  t: 'error'
  code: ErrorCode
  message: string
}

export interface PongMessage {
  t: 'pong'
}

export type ServerMessage =
  | JoinedMessage
  | StateMessage
  | VoteAckMessage
  | VotedMessage
  | RevealedMessage
  | ResetMessage
  | ErrorMessage
  | PongMessage

/* ------------------------------------------------------------------ */
/*  Нормализация ввода                                                */
/* ------------------------------------------------------------------ */

/** Удаляет управляющие символы (C0-диапазон и DEL). */
function stripControlChars(input: string): string {
  let out = ''
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) out += ch
  }
  return out
}

/** Приводит введённый код комнаты к виду, пригодному для поиска. */
export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code)
}

/**
 * Нормализует ник: обрезка краёв, схлопывание пробелов, удаление
 * управляющих символов. Пустой результат означает невалидный ник.
 */
export function normalizeNickname(raw: string): string {
  return stripControlChars(raw).replace(/\s+/g, ' ').trim()
}

export function isNicknameValid(nickname: string): boolean {
  return nickname.length >= 1 && nickname.length <= NICK_MAX_LENGTH
}

/** Алфавит кода комнаты — для подсказки в интерфейсе. */
export const ROOM_CODE_HINT = ROOM_CODE_ALPHABET
export const ROOM_CODE_SIZE = ROOM_CODE_LENGTH
