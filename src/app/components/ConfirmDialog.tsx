import { type ReactNode, useEffect, useState } from 'react'

const GOLD = '#E8B923'

/**
 * An in-page confirmation box, used instead of the browser's own confirm()
 * and prompt() pop-ups ("control.mrsqoopexpress.com says…"). Escape or a click
 * outside closes it, unless the action is already running.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Back',
  danger = false,
  withNote = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  withNote?: boolean
  busy?: boolean
  onConfirm: (note?: string) => void
  onCancel: () => void
}) {
  const [note, setNote] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-bold text-white">
          {title}
        </h2>
        {children && <div className="mt-3 text-sm text-neutral-300">{children}</div>}
        {withNote && (
          <label className="mt-4 block text-sm text-neutral-400">
            Reason (optional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-neutral-500"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(note.trim() || undefined)}
            className={`rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60 ${
              danger ? 'bg-red-600 text-white' : 'text-black'
            }`}
            style={danger ? undefined : { backgroundColor: GOLD }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Supplier and network errors in words the operator can act on, without the
 * raw codes (DELIVERY_SERVICE_EXCEPTION and the like).
 */
export function plainError(message: unknown, fallback: string): string {
  const text = String(message instanceof Error ? message.message : message ?? '').trim()
  if (!text) return fallback
  if (/DELIVERY_SERVICE_EXCEPTION|temporarily unavailable|is busy|rate.?limit|timed? ?out|fetch failed|network/i.test(text)) {
    return 'AliExpress didn’t answer in time. Please try again in a minute.'
  }
  return (
    text
      .replace(/\s*\([A-Z0-9_]{6,}\)/g, '')
      .replace(/:\s*[A-Z0-9_]{6,}\s*$/, '')
      .trim() || fallback
  )
}
