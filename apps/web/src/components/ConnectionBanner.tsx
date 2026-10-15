import type { Status } from '../lib/ws'

interface ConnectionBannerProps {
  status: Status
}

/** Баннер при обрыве связи (ТЗ, 8.3). */
export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === 'open') return null

  const text =
    status === 'closed'
      ? 'Соединение потеряно… переподключаемся'
      : status === 'connecting'
        ? 'Подключение…'
        : ''

  if (!text) return null

  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800"
    >
      {text}
    </div>
  )
}
