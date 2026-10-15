import type { ParticipantView } from '@scrum-poker/shared'
import { cx } from '../lib/cx'

interface ParticipantListProps {
  participants: ParticipantView[]
}

/**
 * Список участников: до вскрытия видно только «проголосовал / ждём» —
 * значение карты скрыто (ТЗ, FR-04).
 */
export function ParticipantList({ participants }: ParticipantListProps) {
  return (
    <ul className="divide-y divide-slate-100">
      {participants.map((p) => (
        <li key={p.id} className="flex items-center gap-2 py-2.5">
          <span
            className={cx(
              'truncate text-sm font-medium',
              !p.connected && 'text-slate-500 line-through',
            )}
            title={p.nickname}
          >
            {p.nickname}
          </span>

          {p.isHost && (
            <span
              className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"
              title="Ведущий"
            >
              ведущий
            </span>
          )}

          <span className="ml-auto shrink-0 text-xs">
            {!p.connected ? (
              <span className="text-slate-500">отключился</span>
            ) : p.voted ? (
              <span className="font-medium text-emerald-700">✓ проголосовал</span>
            ) : (
              <span className="text-slate-500">… ждём</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
