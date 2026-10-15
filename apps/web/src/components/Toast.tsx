interface ToastProps {
  message: string | null
}

/** Временное сообщение об ошибке/действии поверх интерфейса. */
export function Toast({ message }: ToastProps) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto max-w-md"
    >
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-lg">
        {message}
      </div>
    </div>
  )
}
