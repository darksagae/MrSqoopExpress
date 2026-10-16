import { useCallback, useEffect, useState } from 'react'
import { decideCardPayment, fetchCardPayments, type CardPayment } from '../lib/ordersApi'
import { formatTimestamp, formatUgx } from '../lib/ordersStore'
import { ConfirmDialog, plainError } from './ConfirmDialog'

const GOLD = '#E8B923'

/**
 * Card payments made through Absa's payment link. The link has no order
 * reference and doesn't report back, so each order waits here until the
 * operator finds a payment of exactly its amount in Absa's portal. "Payment
 * received" then sends it on like any paid order. Hidden when nothing waits.
 */
export function CardPayments({ onDecided }: { onDecided: () => Promise<void> }) {
  const [payments, setPayments] = useState<CardPayment[] | null>(null)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState<{ payment: CardPayment; received: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setPayments(await fetchCardPayments())
      setError('')
    } catch (e) {
      setError(plainError(e, 'Could not load card payments.'))
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => clearInterval(timer)
  }, [load])

  const decide = async () => {
    if (!asking) return
    setBusy(true)
    try {
      await decideCardPayment(asking.payment.orderId, asking.received)
      setAsking(null)
      await load()
      await onDecided()
    } catch (e) {
      setAsking(null)
      setError(plainError(e, 'Could not save that. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (!error && (!payments || payments.length === 0)) return null

  return (
    <section className="mt-8 rounded-2xl border border-[#E8B923]/60 bg-neutral-950 p-5">
      <h2 className="text-lg font-bold text-white">
        Card payments to check {payments?.length ? <span className="text-neutral-400">({payments.length})</span> : null}
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        Find a payment of exactly this amount in the Absa card portal, then mark it below.
      </p>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-3">
        {(payments ?? []).map((p) => (
          <article key={p.orderId} className="rounded-xl border border-neutral-800 bg-black/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-white">#{p.orderId}</p>
                <p className="text-sm text-neutral-300">{p.customerName} · {p.phone}</p>
                {p.email && <p className="text-xs text-neutral-500">{p.email}</p>}
              </div>
              <p className="text-2xl font-bold" style={{ color: GOLD }}>{formatUgx(p.amountUGX)}</p>
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              Ordered {formatTimestamp(p.placedAt)} ·{' '}
              {p.claimedAt ? (
                <span className="text-green-400">customer says paid {formatTimestamp(p.claimedAt)}</span>
              ) : (
                <span>not marked paid by the customer yet</span>
              )}
            </p>
            {p.items.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                {p.items.map((i) => `${i.qty} × ${i.name.slice(0, 40)}`).join(' · ')}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking({ payment: p, received: true })}
                className="rounded-full px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
                style={{ backgroundColor: GOLD }}
              >
                Payment received
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking({ payment: p, received: false })}
                className="rounded-full border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-60"
              >
                Not received
              </button>
            </div>
          </article>
        ))}
      </div>

      {asking && (
        <ConfirmDialog
          title={asking.received ? 'Mark this card payment as received?' : 'Mark this card payment as not received?'}
          confirmLabel={asking.received ? 'Payment received' : 'Not received'}
          danger={!asking.received}
          busy={busy}
          onConfirm={() => void decide()}
          onCancel={() => setAsking(null)}
        >
          {asking.received ? (
            <p>
              Only if the Absa portal shows a payment of exactly{' '}
              <strong className="text-white">{formatUgx(asking.payment.amountUGX)}</strong> for order{' '}
              {asking.payment.orderId}. The order then goes ahead like any paid order.
            </p>
          ) : (
            <p>
              Order {asking.payment.orderId} is closed as unpaid, and the customer is told no payment of the exact
              amount was found.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  )
}
