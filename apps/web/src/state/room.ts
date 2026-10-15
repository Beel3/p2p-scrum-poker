import type {
  Card,
  JoinedMessage,
  ParticipantView,
  Phase,
  RevealPayload,
  StateMessage,
  VotedMessage,
} from '@scrum-poker/shared'

export interface RoomState {
  code: string
  nickname: string
  selfId: string
  hostId: string | null
  phase: Phase
  participants: ParticipantView[]
  myCard: Card | null
  reveal: RevealPayload | null
}

export type RoomAction =
  | { type: 'joined'; msg: JoinedMessage }
  | { type: 'state'; msg: StateMessage }
  | { type: 'vote_ack'; card: Card | null }
  | { type: 'voted'; msg: VotedMessage }
  | { type: 'revealed'; reveal: RevealPayload }
  | { type: 'reset' }
  | { type: 'leave' }

export function roomReducer(state: RoomState | null, action: RoomAction): RoomState | null {
  switch (action.type) {
    case 'leave':
      return null

    case 'joined': {
      const { msg } = action
      const self = msg.participants.find((p) => p.id === msg.selfId)
      return {
        code: msg.room,
        nickname: self?.nickname ?? '',
        selfId: msg.selfId,
        hostId: msg.hostId,
        phase: msg.phase,
        participants: msg.participants,
        myCard: msg.yourCard,
        reveal: msg.reveal,
      }
    }

    case 'state': {
      if (!state) return state
      const { msg } = action
      return {
        ...state,
        participants: msg.participants,
        hostId: msg.hostId,
        phase: msg.phase,
        // Возврат к голосованию приходит отдельным сообщением reset.
        reveal: msg.phase === 'voting' ? null : state.reveal,
      }
    }

    case 'vote_ack':
      if (!state) return state
      return { ...state, myCard: action.card }

    case 'voted': {
      if (!state) return state
      const { id, voted } = action.msg
      return {
        ...state,
        participants: state.participants.map((p) => (p.id === id ? { ...p, voted } : p)),
      }
    }

    case 'revealed':
      if (!state) return state
      return { ...state, phase: 'revealed', reveal: action.reveal }

    case 'reset':
      if (!state) return state
      return { ...state, phase: 'voting', myCard: null, reveal: null }

    default:
      return state
  }
}
