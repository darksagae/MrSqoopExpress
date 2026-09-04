import { FormEvent, useState } from 'react'
import { RotatingTextRing } from './RotatingTextRing'
import { LogoHeader } from './LogoHeader'
import { PartnersMarquee } from './PartnersMarquee'
import { BusinessAddress } from './BusinessAddress'
import { TrackingTimeline } from './TrackingTimeline'
import { buildOrderDetails, buildTimeline } from '../lib/ordersStore'
import { trackOrder } from '../lib/ordersApi'
import { enableOrderNotifications, isPushSupported } from '../lib/push'
import type { Order } from '../types/order'

const GOLD = '#E8B923'
const GOLD_MUTED = '#B8956A'

type NotifyState = 'idle' | 'working' | 'enabled' | 'error'

function NotifyButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<NotifyState>('idle')
  const [message, setMessage] = useState('')

  if (!isPushSupported()) return null

  const handleClick = async () => {
    setState('working')
    setMessage('')
    const result = await enableOrderNotifications(orderId)
    if (result.ok) {
      setState('enabled')
    } else {
      setState('error')
      setMessage(result.reason)
    }
  }

  if (state === 'enabled') {
    return (
      <p className="mt-4 text-sm font-medium" style={{ color: GOLD }}>
        ✓ You’ll be notified when this order’s status changes.
      </p>
    )
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'working'}
        className="w-full rounded-full border py-3 text-sm font-bold transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        style={{ borderColor: GOLD, color: GOLD }}
      >
        {state === 'working' ? 'Enabling…' : 'Notify me on status updates'}
      </button>
      {state === 'error' && message && (
        <p className="mt-2 px-2 text-sm text-red-400">{message}</p>
      )}
    </div>
  )
}

function TrackForm({
  query,
  error,
  loading,
  onQueryChange,
  onSubmit,
}: {
  query: string
  error: string
  loading: boolean
  onQueryChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label htmlFor="track-query" className="sr-only">
        Order number or phone number
      </label>
      <input
        id="track-query"
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Order number or phone number"
        className="w-full rounded-full border border-neutral-700 bg-neutral-950 px-5 py-3.5 text-[15px] text-white placeholder:text-neutral-500 outline-none transition focus:border-[#E8B923]"
        autoComplete="off"
      />
      {error && <p className="px-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full py-3.5 text-base font-bold text-black transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        style={{ backgroundColor: GOLD }}
      >
        {loading ? 'Searching...' : 'Track Package'}
      </button>
    </form>
  )
}

export function TrackOrder() {
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    if (!query.trim()) {
      setError('Enter your order number or phone number.')
      setOrder(null)
      setLoading(false)
      return
    }

    try {
      const found = await trackOrder(query)
      if (!found) {
        setError('No package found for that order number or phone number.')
        setOrder(null)
        setLoading(false)
        return
      }

      setOrder(found)
    } catch {
      setError('Could not reach the tracking service. Try again.')
      setOrder(null)
    }

    setLoading(false)
  }

  return (
    <>
      <PartnersMarquee />
      <LogoHeader />

      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-6 pt-32 md:pt-36">
        <div className="flex flex-1 flex-col">
          <header className="text-center">
            <h1 className="text-lg font-bold text-white">Track Package</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Enter your order number or phone number to track your package
            </p>
          </header>

          <TrackForm
            query={query}
            error={error}
            loading={loading}
            onQueryChange={(value) => {
              setQuery(value)
              if (error) setError('')
            }}
            onSubmit={handleSubmit}
          />

          {!order && <RotatingTextRing />}

          {order && (
            <>
              <p className="mt-8 text-xl font-bold text-white">Order #{order.trackingId}</p>

              <NotifyButton orderId={order.id} />

              <TrackingTimeline steps={buildTimeline(order)} />

              <div className="my-8 h-px bg-neutral-800" />

              <section>
                <h2 className="text-lg font-bold text-white">Order Details</h2>
                <ul className="mt-5 space-y-4">
                  {buildOrderDetails(order).map((item) => (
                    <li key={item.label} className="flex items-start justify-between gap-4">
                      <span className="text-[15px] font-medium" style={{ color: GOLD_MUTED }}>
                        {item.label}
                      </span>
                      <span className="max-w-[55%] text-right text-[15px] font-semibold text-white">
                        {item.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        <BusinessAddress />
      </div>
    </>
  )
}
