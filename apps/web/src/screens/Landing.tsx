import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '@scrum-poker/shared'
import { useState } from 'react'
import { cx } from '../lib/cx'

interface LandingProps {
  /** Код из ссылки ?room= — предзаполняем поле. */
  prefillCode: string
  /** Ошибки, пришедшие с сервера. */
  notice: string | null
  busy: boolean
  onJoin: (code: string, nickname: string) => void
  onCreate: (nickname: string) => void
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500'

export function Landing({ prefillCode, notice, busy, onJoin, onCreate }: LandingProps) {
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState(prefillCode)
  const [localError, setLocalError] = useState<string | null>(null)

  const invited = prefillCode.length > 0
  const error = localError ?? notice

  function checkNickname(): string | null {
    const nick = nickname.trim()
    if (!nick) return 'Укажите ник'
    if (nick.length > 24) return 'Ник — не длиннее 24 символов'
    return null
  }

  function submitJoin(): void {
    const nickError = checkNickname()
    if (nickError) {
      setLocalError(nickError)
      return
    }
    const normalized = normalizeRoomCode(code)
    if (!isValidRoomCode(normalized)) {
      setLocalError(`Код комнаты — ${ROOM_CODE_LENGTH} символов`)
      return
    }
    setLocalError(null)
    onJoin(normalized, nickname.trim())
  }

  function submitCreate(): void {
    const nickError = checkNickname()
    if (nickError) {
      setLocalError(nickError)
      return
    }
    setLocalError(null)
    onCreate(nickname.trim())
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white">
            ♠
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Scrum Poker</h1>
          <p className="mt-1 text-sm text-slate-500">
            Командная оценка задач: каждый выбирает карту, ведущий вскрывает.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label htmlFor="nick" className="mb-1 block text-sm font-medium text-slate-700">
                Ваш ник
              </label>
              <input
                id="nick"
                value={nickname}
                maxLength={24}
                autoComplete="off"
                placeholder="Например, Алексей"
                onChange={(event) => {
                  setNickname(event.target.value)
                  if (localError) setLocalError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitJoin()
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-700">
                Код комнаты
              </label>
              <input
                id="code"
                value={code}
                maxLength={ROOM_CODE_LENGTH}
                autoComplete="off"
                spellCheck={false}
                placeholder="ABC234"
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase())
                  if (localError) setLocalError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitJoin()
                }}
                className={cx(inputClass, 'font-mono uppercase tracking-[0.3em]')}
              />
              {invited && (
                <p className="mt-1 text-xs text-indigo-600">
                  Комната {prefillCode} — укажите ник, чтобы войти.
                </p>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submitJoin}
            disabled={busy}
            className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            Войти в комнату
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            или
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={submitCreate}
            disabled={busy}
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
          >
            Создать новую комнату
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Сервис внутренний: результаты не сохраняются, история не ведётся.
          </p>
        </div>
      </div>
    </main>
  )
}
