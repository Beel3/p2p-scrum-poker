import type { Card } from '@scrum-poker/shared'
import { useState } from 'react'
import { Confirm } from '../components/Confirm'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { CopyLink } from '../components/CopyLink'
import { Deck } from '../components/Deck'
import { ParticipantList } from '../components/ParticipantList'
import { RevealPanel } from '../components/RevealPanel'
import { cx } from '../lib/cx'
import type { Status } from '../lib/ws'
import type { RoomState } from '../state/room'

interface RoomScreenProps {
  room: RoomState
  status: Status
  onPick: (card: Card) => void
  onUnvote: () => void
  onReveal: () => void
  onReset: () => void
  onTakeHost: () => void
  onLeave: () => void
}

export function RoomScreen({
  room,
  status,
  onPick,
  onUnvote,
  onReveal,
  onReset,
  onTakeHost,
  onLeave,
}: RoomScreenProps) {
  const [confirmingHost, setConfirmingHost] = useState(false)

  const isHost = room.hostId === room.selfId
  const connected = status === 'open'
  const voting = room.phase === 'voting'
  const votedCount = room.participants.filter((p) => p.voted).length
  const total = room.participants.length
  const deckDisabled = !voting || !connected

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold tracking-tight text-slate-900">Scrum Poker</span>

          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold tracking-[0.25em] text-slate-700">
            {room.code}
          </span>

          <CopyLink code={room.code} />

          <div className="ml-auto flex items-center gap-3">
            <span className="max-w-32 truncate text-sm text-slate-500" title={room.nickname}>
              {room.nickname}
            </span>
            <button
              type="button"
              onClick={onLeave}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <ConnectionBanner status={status} />

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">
                {voting ? 'Выберите карту' : 'Результаты голосования'}
              </h2>
              <span
                className={cx(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  voting ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700',
                )}
              >
                {voting
                  ? `Проголосовало ${votedCount} из ${total}`
                  : `Оценили ${room.reveal?.stats.evaluated ?? 0} из ${total}`}
              </span>
            </div>

            {voting ? (
              <>
                <Deck selected={room.myCard} disabled={deckDisabled} onPick={onPick} />

                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                  {room.myCard === null ? (
                    <p className="text-sm text-slate-500">
                      {connected
                        ? 'Карта не выбрана — проголосуйте или дождитесь остальных.'
                        : 'Нет соединения — голосовать нельзя.'}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600">
                        Ваша карта:{' '}
                        <span className="font-semibold tabular-nums text-indigo-700">
                          {room.myCard}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={onUnvote}
                        disabled={!connected}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Отменить мой выбор
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : room.reveal ? (
              <RevealPanel reveal={room.reveal} />
            ) : (
              <p className="text-sm text-slate-500">Обновление результатов…</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {isHost ? (
              <>
                <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                  Вы ведущий
                </span>
                {voting ? (
                  <button
                    type="button"
                    onClick={onReveal}
                    disabled={!connected}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Вскрыть карты
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onReset}
                    disabled={!connected}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                  >
                    Сбросить карты
                  </button>
                )}
                <span className="text-xs text-slate-500">{hostHint(voting)}</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmingHost(true)}
                  disabled={!connected}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
                >
                  Стать ведущим
                </button>
                <span className="text-xs text-slate-500">
                  Ведущий вскрывает и сбрасывает карты.
                </span>
              </>
            )}
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-semibold text-slate-900">Участники</h2>
            <span className="text-xs text-slate-500">{total}</span>
          </div>
          <p className="mb-2 text-xs text-slate-500">Значения карт скрыты до вскрытия.</p>
          <ParticipantList participants={room.participants} />
        </aside>
      </main>

      {confirmingHost && (
        <Confirm
          title="Забрать роль ведущего?"
          body="Вы сможете вскрывать и сбрасывать карты. Текущий ведущий станет обычным участником."
          confirmLabel="Да, я ведущий"
          onCancel={() => setConfirmingHost(false)}
          onConfirm={() => {
            setConfirmingHost(false)
            onTakeHost()
          }}
        />
      )}
    </div>
  )
}

function hostHint(voting: boolean): string {
  return voting ? 'Вскройте, когда все проголосовали.' : 'Сбросьте, чтобы начать новое голосование.'
}
