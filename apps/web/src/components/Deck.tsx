import { DECK, type Card } from '@scrum-poker/shared'
import { cx } from '../lib/cx'

interface DeckProps {
  selected: Card | null
  disabled: boolean
  onPick: (card: Card) => void
}

/** Колода 0, 0.5, 1…10 (ТЗ, FR-04). Клик по выбранной карте снимает голос. */
export function Deck({ selected, disabled, onPick }: DeckProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3">
      {DECK.map((card) => {
        const active = selected === card
        return (
          <button
            key={card}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={`Оценка ${card}`}
            onClick={() => onPick(card)}
            className={cx(
              'rounded-xl border-2 py-4 text-center text-xl font-semibold tabular-nums transition-transform duration-150 sm:text-2xl',
              disabled && 'cursor-not-allowed opacity-40',
              active
                ? '-translate-y-1 border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : !disabled &&
                    'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md',
            )}
          >
            {card}
          </button>
        )
      })}
    </div>
  )
}
