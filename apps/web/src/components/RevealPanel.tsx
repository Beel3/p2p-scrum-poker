import type { RevealPayload } from '@scrum-poker/shared'

interface RevealPanelProps {
  reveal: RevealPayload
}

function format(value: number | null): string {
  return value === null ? '—' : String(value)
}

/** Итоги вскрытия: поимённые голоса + медиана, среднее, разброс (ТЗ, FR-05). */
export function RevealPanel({ reveal }: RevealPanelProps) {
  const { votes, stats } = reveal

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <caption className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-left font-semibold text-slate-700">
            Карты вскрыты
          </caption>
          <tbody>
            {votes.map((vote) => (
              <tr key={vote.id} className="border-b border-slate-100 last:border-0">
                <td className="max-w-0 truncate px-4 py-2.5 text-slate-700" title={vote.nickname}>
                  {vote.nickname}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {vote.card === null ? (
                    <span className="text-xs text-slate-500">не голосовал</span>
                  ) : (
                    <span className="inline-block min-w-10 rounded-lg bg-indigo-600 px-2 py-1 font-semibold tabular-nums text-white">
                      {vote.card}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-indigo-700">Медиана</dt>
            <dd className="text-xl font-bold tabular-nums text-indigo-900">
              {format(stats.median)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-indigo-700">Среднее</dt>
            <dd className="text-xl font-bold tabular-nums text-indigo-900">{format(stats.mean)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-indigo-700">Разброс</dt>
            <dd className="text-xl font-bold tabular-nums text-indigo-900">
              {stats.min === null ? '—' : `${stats.min}–${stats.max}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-indigo-700">Оценили</dt>
            <dd className="text-xl font-bold tabular-nums text-indigo-900">
              {stats.evaluated} из {stats.total}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-600">
          Разброс сильнее медианы говорит о разногласиях — обсудите крайние оценки.
        </p>
      </div>
    </div>
  )
}
