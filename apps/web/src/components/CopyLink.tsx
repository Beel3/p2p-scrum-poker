import { useEffect, useState } from 'react'
import { cx } from '../lib/cx'

interface CopyLinkProps {
  code: string
}

/** Ссылка-приглашение: копируется одним кликом (ТЗ, 8.2). */
export function CopyLink({ code }: CopyLinkProps) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/?room=${code}`

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const area = document.createElement('textarea')
        area.value = link
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      setCopied(true)
    } catch {
      // Буфер обмена недоступен — покажем ссылку в title.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={link}
      className={cx(
        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        copied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600',
      )}
    >
      {copied ? '✓ Скопировано' : 'Скопировать ссылку'}
    </button>
  )
}
