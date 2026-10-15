import type { Card, ServerMessage } from '@scrum-poker/shared'
import { isValidRoomCode, normalizeRoomCode } from '@scrum-poker/shared'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Toast } from './components/Toast'
import { loadSession, saveSession, type Session } from './lib/session'
import { WsClient, type Status } from './lib/ws'
import { Landing } from './screens/Landing'
import { RoomScreen } from './screens/RoomScreen'
import { roomReducer } from './state/room'

const NOTICE_TTL_MS = 6000

interface Notice {
  id: number
  text: string
}

export default function App() {
  const [client] = useState(() => new WsClient())
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [prefill, setPrefill] = useState(() =>
    normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''),
  )
  const [room, dispatch] = useReducer(roomReducer, null)
  const [status, setStatus] = useState<Status>('idle')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  // Пока true, ошибка от сервера означает «вход не удался», а не «действие запрещено».
  const pendingJoin = useRef(false)

  function notify(text: string): void {
    setNotice({ id: Date.now() + Math.random(), text })
  }

  /* ------------------------- обработка сообщений ------------------------ */

  const handleMessage = (msg: ServerMessage): void => {
    switch (msg.t) {
      case 'joined':
        pendingJoin.current = false
        dispatch({ type: 'joined', msg })
        setNotice(null)
        break
      case 'state':
        dispatch({ type: 'state', msg })
        break
      case 'vote_ack':
        dispatch({ type: 'vote_ack', card: msg.card })
        break
      case 'voted':
        dispatch({ type: 'voted', msg })
        break
      case 'revealed':
        dispatch({ type: 'revealed', reveal: msg.reveal })
        break
      case 'reset':
        dispatch({ type: 'reset' })
        break
      case 'pong':
        break
      case 'error':
        notify(msg.message)
        if (pendingJoin.current) {
          // Вход не удался: комната закрыта (сервер перезапущен) или место занято.
          // Возвращаем на экран входа, иначе пользователь застрянет на устаревшем экране.
          pendingJoin.current = false
          dispatch({ type: 'leave' })
          setPrefill(session?.code ?? '')
          setSession(null)
        }
        break
    }
  }

  // Храним свежий замыкание в ref, чтобы не переподключаться при каждой перерисовке.
  const handlerRef = useRef(handleMessage)
  useEffect(() => {
    handlerRef.current = handleMessage
  })

  useEffect(() => {
    const offMessage = client.onMessage((msg) => handlerRef.current(msg))
    const offStatus = client.onStatus(setStatus)
    client.start()
    return () => {
      offMessage()
      offStatus()
      client.stop()
    }
  }, [client])

  // Входим (и переподходим) в комнату при каждом открытии соединения.
  useEffect(() => {
    if (status === 'open' && session) {
      pendingJoin.current = true
      client.send({ t: 'join', room: session.code, nickname: session.nickname })
    }
  }, [status, session, client])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    saveSession(session)
  }, [session])

  /* ------------------------------ действия ------------------------------ */

  function handleJoin(code: string, nickname: string): void {
    const nick = nickname.trim()
    if (!nick || nick.length > 24) {
      notify('Укажите ник — до 24 символов')
      return
    }
    const normalized = normalizeRoomCode(code)
    if (!isValidRoomCode(normalized)) {
      notify('Некорректный код комнаты')
      return
    }
    setNotice(null)
    setSession({ code: normalized, nickname: nick })
  }

  async function handleCreate(nickname: string): Promise<void> {
    const nick = nickname.trim()
    if (!nick || nick.length > 24) {
      notify('Укажите ник — до 24 символов')
      return
    }

    setBusy(true)
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        notify(data?.message ?? 'Не удалось создать комнату')
        return
      }

      const data = (await response.json()) as { code: string }
      const url = new URL(window.location.href)
      url.searchParams.set('room', data.code)
      window.history.replaceState(null, '', url)

      setPrefill(data.code)
      setNotice(null)
      setSession({ code: data.code, nickname: nick })
    } catch {
      notify('Сервер недоступен — попробуйте позже')
    } finally {
      setBusy(false)
    }
  }

  function handleLeave(): void {
    client.send({ t: 'leave' })
    dispatch({ type: 'leave' })
    setSession(null)
    setPrefill('')
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState(null, '', url)
  }

  function pick(card: Card): void {
    if (!client.send({ t: 'vote', card })) {
      notify('Нет соединения — повторите после переподключения')
    }
  }

  function sendOrWarn(message: Parameters<WsClient['send']>[0]): void {
    if (!client.send(message)) notify('Нет соединения — повторите после переподключения')
  }

  /* ------------------------------- рендер ------------------------------- */

  const content = room ? (
    <RoomScreen
      room={room}
      status={status}
      onPick={pick}
      onUnvote={() => sendOrWarn({ t: 'unvote' })}
      onReveal={() => sendOrWarn({ t: 'reveal' })}
      onReset={() => sendOrWarn({ t: 'reset' })}
      onTakeHost={() => sendOrWarn({ t: 'take_host' })}
      onLeave={handleLeave}
    />
  ) : session ? (
    <ConnectingScreen code={session.code} onReset={() => setSession(null)} />
  ) : (
    <Landing
      prefillCode={prefill}
      notice={notice?.text ?? null}
      busy={busy}
      onJoin={handleJoin}
      onCreate={(nick) => void handleCreate(nick)}
    />
  )

  return (
    <>
      {content}
      <Toast key={notice?.id} message={notice?.text ?? null} />
    </>
  )
}

interface ConnectingScreenProps {
  code: string
  onReset: () => void
}

function ConnectingScreen({ code, onReset }: ConnectingScreenProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
        <h1 className="font-semibold text-slate-900">Подключение к комнате</h1>
        <p className="mt-1 font-mono text-lg tracking-[0.3em] text-slate-500">{code}</p>
        <p className="mt-3 text-sm text-slate-500">
          Если комната закрыта или сервер перезапущен, вход не восстановится.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
        >
          Войти заново
        </button>
      </div>
    </main>
  )
}
