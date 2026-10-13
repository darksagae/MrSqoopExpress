import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Logo } from './Logo'
import { AdminLogin } from './AdminLogin'
import { ResetPassword } from './ResetPassword'
import { ShopSettings } from './ShopSettings'
import { ConfirmDialog, plainError } from './ConfirmDialog'
import { adminLogout, isAdminLoggedIn } from '../lib/adminAuth'
import {
  advanceOrder,
  createOrder,
  deleteOrder,
  fetchAllOrders,
  migrateDatabase,
  placeSupplierOrder,
  quoteSupplierOrder,
  reviewOrder,
  updateOrderBilling,
  type SupplierQuote,
} from '../lib/ordersApi'
import {
  filterOrdersByCategory,
  formatOutstandingBilling,
  formatTimestamp,
  formatUgx,
  getOrderStats,
  orderBreakdown,
  paymentLabel,
  supplierUrl,
  type OrderFilter,
} from '../lib/ordersStore'
import { publicSiteHref } from '../lib/site'
import {
  DEFAULT_SHIPPING_WEBSITE,
  SHIPPING_WEBSITES,
  type ShippingWebsite,
} from '../constants/shippingWebsites'
import { TRACKING_STAGES, type Order, type ReviewAction } from '../types/order'

const GOLD = '#E8B923'

const FILTER_LABELS: Record<OrderFilter, string> = {
  awaiting: 'Awaiting Action',
  all: 'All Orders',
  inTransit: 'In Transit',
  atCustoms: 'At Customs',
  readyForPickup: 'Ready for Pickup',
  delivered: 'Delivered',
}

function AdminLogo({ className = 'h-16 md:h-20' }: { className?: string }) {
  return <Logo className={className} />
}

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: string | number
  active?: boolean
  onClick?: () => void
}) {
  const className = `rounded-2xl border px-4 py-3 text-left transition ${
    active
      ? 'border-[#E8B923] bg-neutral-900'
      : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600'
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-white">{value}</p>
      </button>
    )
  }

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  )
}

function filterOrders(orders: Order[], query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return orders

  return orders.filter((order) => {
    const phoneDigits = order.phone.replace(/\D/g, '')
    const searchDigits = term.replace(/\D/g, '')

    return (
      order.trackingId.toLowerCase().includes(term) ||
      order.customerName.toLowerCase().includes(term) ||
      order.websiteShippedFrom.toLowerCase().includes(term) ||
      order.phone.toLowerCase().includes(term) ||
      (order.payment ? paymentLabel(order.payment.method).toLowerCase().includes(term) : false) ||
      (order.items ?? []).some((item) => item.name.toLowerCase().includes(term)) ||
      (searchDigits.length > 0 && phoneDigits.includes(searchDigits))
    )
  })
}

function BillingEditor({
  order,
  onUpdate,
}: {
  order: Order
  onUpdate: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(order.billingUgx > 0 ? String(order.billingUgx) : '')
          setError('')
          setEditing(true)
        }}
        className="mt-1 text-sm text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-white"
      >
        {formatOutstandingBilling(order.billingUgx)}
      </button>
    )
  }

  const handleSave = async () => {
    const amount = Number(value.replace(/\D/g, ''))
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateOrderBilling(order.id, amount)
      await onUpdate()
      setEditing(false)
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1">
      <div className="flex items-center justify-end gap-1">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="UGX amount"
          className="w-28 rounded-lg border border-neutral-700 bg-black px-2 py-1 text-right text-sm text-white outline-none focus:border-[#E8B923]"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg px-2 py-1 text-xs font-bold text-black disabled:opacity-60"
          style={{ backgroundColor: GOLD }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-300"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

const REVIEW_BADGE = {
  pending: { label: 'AWAITING CONFIRMATION', className: 'bg-[#E8B923] text-black' },
  on_hold: { label: 'ON HOLD', className: 'bg-orange-500 text-black' },
  confirmed: { label: 'CONFIRMED', className: 'bg-emerald-500 text-black' },
  cancelled: { label: 'CANCELLED', className: 'bg-red-500 text-white' },
} as const

const REVIEW_TITLES: Record<ReviewAction, string> = {
  confirm: 'Confirm this order?',
  hold: 'Put this order on hold?',
  cancel: 'Cancel this order?',
}

const REVIEW_PROMPTS: Record<ReviewAction, string> = {
  confirm: 'The customer will see it move to "Order Processing".',
  hold: 'It stays here until you confirm or cancel it.',
  cancel: 'The customer has already paid, so you must refund them in LipaPay or Absa.',
}

const REVIEW_BUTTONS: Record<ReviewAction, string> = {
  confirm: 'Confirm order',
  hold: 'Put on hold',
  cancel: 'Cancel order',
}

/** After confirming: place the order with the supplier, then pay it there. */
function SupplierPanel({ order, onUpdate }: { order: Order; onUpdate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<SupplierQuote | null>(null)
  const [error, setError] = useState('')
  const supplier = order.supplier

  // Show what AliExpress charges to ship to Dubai next to what the customer
  // paid (checkout quotes the same Dubai shipping), before anything is ordered.
  const preview = async () => {
    setBusy(true)
    setError('')
    try {
      setQuote(await quoteSupplierOrder(order.id))
    } catch (e) {
      setError(plainError(e, 'Could not get the shipping cost. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const place = async () => {
    setBusy(true)
    setError('')
    try {
      await placeSupplierOrder(order.id)
    } catch (e) {
      setError(plainError(e, 'Could not place the order. Please try again.'))
    } finally {
      setQuote(null)
      await onUpdate()
      setBusy(false)
    }
  }

  if (supplier?.status === 'placed') {
    return (
      <div className="mt-2 text-sm text-neutral-300">
        <p>
          <span className="font-bold text-green-400">Placed on AliExpress</span> · order{' '}
          {supplier.orderIds.join(', ')}
        </p>
        {supplier.dubaiShipUsd != null && (
          <p className="mt-1 text-neutral-400">
            Shipping to Dubai: {supplier.dubaiShipUsd ? `US$${supplier.dubaiShipUsd.toFixed(2)}` : 'free'}
          </p>
        )}
        <p className="mt-1 text-neutral-400">
          Now pay it in the AliExpress account:{' '}
          <a
            href="https://www.aliexpress.com/p/order/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: GOLD }}
          >
            open my AliExpress orders
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2 text-sm text-neutral-400">
      {error ? (
        <p className="mb-2 text-red-300">{error}</p>
      ) : (
        supplier?.status === 'failed' && (
          <p className="mb-2 text-red-300">
            Last attempt didn’t go through: {plainError(supplier.error, 'please try again.')}
          </p>
        )
      )}
      {supplier?.status === 'placing' ? (
        <p>Placing the order with AliExpress… refresh in a moment.</p>
      ) : (
        <>
          <p>Next: place this order on AliExpress, shipped to the Dubai warehouse.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void preview()}
            className="mt-3 rounded-full px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
            style={{ backgroundColor: GOLD }}
          >
            {busy && !quote ? 'Getting shipping cost…' : supplier?.status === 'failed' ? 'Try placing again' : 'Place order on AliExpress'}
          </button>
          <p className="mt-2 text-xs text-neutral-500">Or buy it by hand using the links below.</p>
        </>
      )}

      {quote && (
        <ConfirmDialog
          title="Place this order on AliExpress?"
          confirmLabel="Place order"
          busy={busy}
          onConfirm={() => void place()}
          onCancel={() => setQuote(null)}
        >
          <p className="font-semibold text-neutral-200">Shipping to the Dubai warehouse</p>
          <ul className="mt-2 space-y-1">
            {quote.lines.map((line, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {line.qty} × {line.name}
                  <span className="block text-xs text-neutral-500">{line.service}</span>
                </span>
                <span className="shrink-0">{line.shipUSD ? `US$${line.shipUSD.toFixed(2)}` : 'Free'}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-neutral-800 pt-3">
            <div className="flex justify-between">
              <dt>Total to Dubai</dt>
              <dd>
                US${quote.dubaiShipUSD.toFixed(2)} ({formatUgx(quote.dubaiShipUGX)})
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Customer paid for shipping</dt>
              <dd>{formatUgx(quote.paidShipUGX)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Customer paid for handling</dt>
              <dd>{formatUgx(quote.paidHandlingUGX)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-neutral-100">
              <dt>Left for Dubai to Uganda</dt>
              <dd>{formatUgx(quote.leftForUgandaLegUGX)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">You then pay it in the AliExpress account.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function ReviewPanel({ order, onUpdate }: { order: Order; onUpdate: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<ReviewAction | null>(null)
  const [error, setError] = useState('')
  const review = order.review
  if (!review) return null

  const act = async (action: ReviewAction, note?: string) => {
    setBusy(true)
    setError('')
    try {
      await reviewOrder(order.id, action, note)
      setAsking(null)
      await onUpdate()
    } catch (e) {
      setAsking(null)
      setError(plainError(e, 'Could not update this order. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const badge = REVIEW_BADGE[review.status]
  const open = review.status === 'pending' || review.status === 'on_hold'

  return (
    <div className="mt-3 rounded-xl border border-neutral-800 bg-black/40 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.className}`}>{badge.label}</span>
        {review.at && review.status !== 'pending' && (
          <span className="text-neutral-500">{formatTimestamp(review.at)}</span>
        )}
      </p>
      {review.note && <p className="mt-2 text-sm text-neutral-400">Note: {review.note}</p>}

      {review.status === 'pending' && (
        <p className="mt-2 text-sm text-neutral-400">
          Paid. Check the price and stock on AliExpress, then confirm.
        </p>
      )}
      {review.status === 'confirmed' && <SupplierPanel order={order} onUpdate={onUpdate} />}
      {review.status === 'cancelled' && (
        <p className="mt-2 text-sm text-red-300">Refund the customer in LipaPay or Absa if you haven’t already.</p>
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {asking && (
        <ConfirmDialog
          title={REVIEW_TITLES[asking]}
          confirmLabel={REVIEW_BUTTONS[asking]}
          cancelLabel="Back"
          danger={asking === 'cancel'}
          withNote={asking !== 'confirm'}
          busy={busy}
          onConfirm={(note) => void act(asking, note)}
          onCancel={() => setAsking(null)}
        >
          <p>{REVIEW_PROMPTS[asking]}</p>
        </ConfirmDialog>
      )}

      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsking('confirm')}
            className="rounded-full px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
            style={{ backgroundColor: GOLD }}
          >
            Confirm order
          </button>
          {review.status === 'pending' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking('hold')}
              className="rounded-full border border-neutral-600 px-4 py-2 text-sm text-neutral-200 disabled:opacity-60"
            >
              Hold
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsking('cancel')}
            className="rounded-full border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function PaymentAndItems({ order }: { order: Order }) {
  const items = order.items ?? []
  const payment = order.payment
  if (!payment && items.length === 0) return null

  // Computed from the lines themselves rather than from billingUgx, which the
  // operator can edit later. The storefront charges exactly this sum.
  const breakdown = orderBreakdown(items)

  return (
    <div className="mt-3 space-y-3">
      {payment && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
          {/* Test checkout records orders as paid without taking money (TEST- reference). */}
          {payment.ref?.startsWith('TEST-') ? (
            <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
              TEST ORDER · NOT PAID
            </span>
          ) : (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold text-black"
              style={{ backgroundColor: GOLD }}
            >
              PAID
            </span>
          )}
          <span className="text-neutral-300">{paymentLabel(payment.method)}</span>
          {payment.paidAt && <span>· {formatTimestamp(payment.paidAt)}</span>}
          {payment.ref && payment.method !== 'card' && (
            <span className="break-all text-xs text-neutral-600">Ref {payment.ref}</span>
          )}
          {payment.method === 'card' && (
            <span className="text-xs text-neutral-600">
              Find it in CyberSource by merchant reference #{order.trackingId}
            </span>
          )}
        </p>
      )}

      {items.length > 0 && (
        <details open className="rounded-xl border border-neutral-800 bg-black/40 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            Items to order ({items.reduce((n, i) => n + i.qty, 0)})
          </summary>
          <ul className="mt-3 space-y-3">
            {items.map((item, index) => {
              const url = supplierUrl(item.productId)
              return (
                <li key={`${item.productId}-${item.skuId}-${index}`} className="text-sm">
                  <p className="text-neutral-200">
                    <span className="font-bold" style={{ color: GOLD }}>
                      {item.qty} ×
                    </span>{' '}
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatUgx(item.unitUgx)} each
                    {item.skuId ? ` · option ${item.skuId}` : ''}
                    {url && (
                      <>
                        {' · '}
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                          style={{ color: GOLD }}
                        >
                          Open on AliExpress
                        </a>
                      </>
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
          {items.length > 0 && (
            <dl className="mt-3 space-y-1 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
              <div className="flex justify-between">
                <dt>Goods</dt>
                <dd className="text-neutral-300">{formatUgx(breakdown.goods)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd className="text-neutral-300">{formatUgx(breakdown.shipping)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Handling</dt>
                <dd className="text-neutral-300">{formatUgx(breakdown.handling)}</dd>
              </div>
              {order.promo && order.promo.discountUgx > 0 && (
                <div className="flex justify-between">
                  <dt>Promo {order.promo.code}</dt>
                  <dd className="text-green-400">−{formatUgx(order.promo.discountUgx)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold text-neutral-200">
                <dt>Paid by customer</dt>
                <dd>{formatUgx(breakdown.total - (order.promo?.discountUgx ?? 0))}</dd>
              </div>
            </dl>
          )}
        </details>
      )}
    </div>
  )
}

function OrderRow({
  order,
  onUpdate,
}: {
  order: Order
  onUpdate: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const stageLabel = TRACKING_STAGES[order.currentStageIndex]
  const canAdvance = order.currentStageIndex < TRACKING_STAGES.length - 1

  return (
    <article className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">#{order.trackingId}</p>
          <p className="mt-1 text-sm text-neutral-400">{order.customerName}</p>
          <p className="text-sm text-neutral-500">{order.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold" style={{ color: GOLD }}>
            {stageLabel}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Since {formatTimestamp(order.statusHistory[order.statusHistory.length - 1]?.timestamp ?? order.createdAt)}
          </p>
          <BillingEditor order={order} onUpdate={onUpdate} />
        </div>
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        From <span className="text-neutral-300">{order.websiteShippedFrom}</span>
      </p>

      <ReviewPanel order={order} onUpdate={onUpdate} />
      <PaymentAndItems order={order} />

      <div className="mt-4 flex flex-wrap gap-2">
        {canAdvance && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await advanceOrder(order.id)
              await onUpdate()
              setBusy(false)
            }}
            className="rounded-full px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
            style={{ backgroundColor: GOLD }}
          >
            Advance Status
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDeleteError('')
            setConfirmDelete(true)
          }}
          className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-60"
        >
          Delete
        </button>
      </div>
      {deleteError && <p className="mt-2 text-sm text-red-300">{deleteError}</p>}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this order?"
          confirmLabel="Delete order"
          danger
          busy={busy}
          onConfirm={async () => {
            setBusy(true)
            try {
              await deleteOrder(order.id)
              setConfirmDelete(false)
              await onUpdate()
            } catch {
              setConfirmDelete(false)
              setDeleteError('Could not delete this order. Please try again.')
            } finally {
              setBusy(false)
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>This can’t be undone.</p>
        </ConfirmDialog>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-neutral-400">Status history</summary>
        <ul className="mt-2 space-y-1 text-sm text-neutral-500">
          {[...order.statusHistory]
            .sort((a, b) => a.stageIndex - b.stageIndex)
            .map((entry, index) => (
              <li key={`${entry.stageIndex}-${entry.timestamp}-${index}`}>
                {TRACKING_STAGES[entry.stageIndex]} · {formatTimestamp(entry.timestamp)}
              </li>
            ))}
        </ul>
      </details>
    </article>
  )
}

export function AdminPage() {
  const [resetToken, setResetToken] = useState(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('reset_token'),
  )
  const [sessionChecked, setSessionChecked] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState<ShippingWebsite>(DEFAULT_SHIPPING_WEBSITE)
  const [otherWebsite, setOtherWebsite] = useState('')
  const [billingUgx, setBillingUgx] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeFilter, setActiveFilter] = useState<OrderFilter | null>(null)
  const [orderSearch, setOrderSearch] = useState('')

  const stats = useMemo(() => getOrderStats(orders), [orders])
  const categoryOrders = useMemo(
    () => (activeFilter ? filterOrdersByCategory(orders, activeFilter) : []),
    [orders, activeFilter],
  )
  const filteredOrders = useMemo(
    () => filterOrders(categoryOrders, orderSearch),
    [categoryOrders, orderSearch],
  )

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError('')

    try {
      const nextOrders = await fetchAllOrders()
      setOrders(nextOrders)
    } catch {
      setOrdersError('Could not load orders. Check database connection.')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  useEffect(() => {
    isAdminLoggedIn().then((authenticated) => {
      setLoggedIn(authenticated)
      setSessionChecked(true)
    })
  }, [])

  useEffect(() => {
    if (!loggedIn) return
    void loadOrders()
  }, [loggedIn, loadOrders])

  const toggleFilter = (filter: OrderFilter) => {
    setActiveFilter((current) => (current === filter ? null : filter))
    setOrderSearch('')
  }

  const handleCreateOrder = async (event: FormEvent) => {
    event.preventDefault()
    const websiteShippedFrom = website === 'Other' ? otherWebsite.trim() : website

    if (!customerName.trim() || !orderNo.trim() || !phone.trim() || !websiteShippedFrom) {
      setFormError('Fill in customer, order number, phone, and website.')
      return
    }

    const amount = billingUgx.trim() ? Number(billingUgx.replace(/\D/g, '')) : 0

    setSubmitting(true)
    const result = await createOrder({
      customerName,
      trackingId: orderNo,
      phone,
      websiteShippedFrom,
      billingUgx: amount,
    })
    setSubmitting(false)

    if ('error' in result) {
      setFormError(result.error)
      return
    }

    setCustomerName('')
    setOrderNo('')
    setPhone('')
    setWebsite(DEFAULT_SHIPPING_WEBSITE)
    setOtherWebsite('')
    setBillingUgx('')
    setFormError('')
    await loadOrders()
  }

  const handleLoginSuccess = async () => {
    setLoggedIn(true)
    try {
      await migrateDatabase()
    } catch {
      // Migration may already be applied; orders load will surface real errors.
    }
    await loadOrders()
  }

  if (resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onDone={() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('reset_token')
          window.history.replaceState({}, '', url.toString())
          setResetToken(null)
        }}
      />
    )
  }

  if (!sessionChecked) {
    return <div className="fixed inset-0 bg-black" />
  }

  if (!loggedIn) {
    return <AdminLogin onSuccess={() => void handleLoginSuccess()} />
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-black">
      <div className="mx-auto w-full max-w-3xl px-5 pb-10 pt-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <AdminLogo />
          <div className="flex gap-2">
            <a
              href={publicSiteHref('/')}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
            >
              View Site
            </a>
            <button
              type="button"
              onClick={() => {
                adminLogout()
                setLoggedIn(false)
                setOrders([])
              }}
              className="rounded-full px-4 py-2 text-sm font-bold text-black"
              style={{ backgroundColor: GOLD }}
            >
              Logout
            </button>
          </div>
        </header>

        {ordersError && (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {ordersError}
          </p>
        )}

        <section className="mt-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard
              label="Awaiting Action"
              value={stats.awaiting}
              active={activeFilter === 'awaiting'}
              onClick={() => toggleFilter('awaiting')}
            />
            <StatCard
              label="Total Orders"
              value={stats.total}
              active={activeFilter === 'all'}
              onClick={() => toggleFilter('all')}
            />
            <StatCard
              label="In Transit"
              value={stats.inTransit}
              active={activeFilter === 'inTransit'}
              onClick={() => toggleFilter('inTransit')}
            />
            <StatCard
              label="At Customs"
              value={stats.atCustoms}
              active={activeFilter === 'atCustoms'}
              onClick={() => toggleFilter('atCustoms')}
            />
            <StatCard
              label="Ready for Pickup"
              value={stats.readyForPickup}
              active={activeFilter === 'readyForPickup'}
              onClick={() => toggleFilter('readyForPickup')}
            />
            <StatCard
              label="Delivered"
              value={stats.delivered}
              active={activeFilter === 'delivered'}
              onClick={() => toggleFilter('delivered')}
            />
          </div>

          {activeFilter && (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
              <p className="text-sm font-semibold text-white">
                {FILTER_LABELS[activeFilter]}
                <span className="ml-2 font-normal text-neutral-500">
                  ({filteredOrders.length}
                  {orderSearch.trim() ? ` of ${categoryOrders.length}` : ''})
                </span>
              </p>

              <input
                type="search"
                value={orderSearch}
                onChange={(event) => setOrderSearch(event.target.value)}
                placeholder="Search by order #, name, phone, website, item, or payment..."
                className="mt-3 w-full rounded-full border border-neutral-700 bg-black px-5 py-3 text-sm text-white placeholder:text-neutral-500 outline-none focus:border-[#E8B923]"
              />

              <div className="mt-4 space-y-4">
                {ordersLoading ? (
                  <p className="text-neutral-500">Loading orders...</p>
                ) : orders.length === 0 ? (
                  <p className="text-neutral-500">No orders yet.</p>
                ) : categoryOrders.length === 0 ? (
                  <p className="text-neutral-500">No orders in this category.</p>
                ) : filteredOrders.length === 0 ? (
                  <p className="text-neutral-500">No orders match your search.</p>
                ) : (
                  filteredOrders.map((order) => (
                    <OrderRow key={order.id} order={order} onUpdate={loadOrders} />
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        <ShopSettings />

        <section className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
          <h2 className="text-lg font-bold text-white">Create Order</h2>
          <form onSubmit={(event) => void handleCreateOrder(event)} className="mt-4 grid gap-3 md:grid-cols-2">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
              className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923]"
            />
            <input
              value={orderNo}
              onChange={(event) => setOrderNo(event.target.value)}
              placeholder="Order No"
              className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923]"
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone (07xxxxxxxx)"
              className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923] md:col-span-2"
            />
            <select
              value={website}
              onChange={(event) => setWebsite(event.target.value as ShippingWebsite)}
              className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923] md:col-span-2"
            >
              <option value="" disabled>
                Website shipped from
              </option>
              {SHIPPING_WEBSITES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {website === 'Other' && (
              <input
                value={otherWebsite}
                onChange={(event) => setOtherWebsite(event.target.value)}
                placeholder="Enter other website"
                className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923] md:col-span-2"
              />
            )}
            <input
              value={billingUgx}
              onChange={(event) => setBillingUgx(event.target.value)}
              placeholder="Outstanding Billing (UGX) — leave blank to confirm later"
              className="rounded-xl border border-neutral-700 bg-black px-4 py-3 text-white outline-none focus:border-[#E8B923] md:col-span-2"
            />
            {formError && <p className="text-sm text-red-400 md:col-span-2">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full py-3 font-bold text-black disabled:opacity-60 md:col-span-2"
              style={{ backgroundColor: GOLD }}
            >
              {submitting ? 'Creating...' : 'Create Order'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
