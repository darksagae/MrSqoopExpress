const LAST_STAGE_INDEX = 9
import { getSql } from './db.js'

export interface StatusHistoryEntry {
  stageIndex: number
  timestamp: string
  note?: string
}

/** One purchased line, as the storefront recorded it. */
export interface OrderItem {
  productId: string
  skuId: string | null
  name: string
  qty: number
  unitUgx: number
  shipUgx: number
  handlingUgx: number
}

export type PaymentMethod = 'mtn' | 'airtel' | 'card'

export interface OrderPayment {
  method: PaymentMethod | null
  ref: string | null
  paidAt: string | null
}

/** What customers see on the public tracking page. Never add payment or item detail here. */
export interface Order {
  id: string
  trackingId: string
  customerName: string
  phone: string
  websiteShippedFrom: string
  billingUgx: number
  currentStageIndex: number
  statusHistory: StatusHistoryEntry[]
  expectedDelivery?: string
  createdAt: string
}

/**
 * The operator's decision on a paid order. Paid orders arrive as 'pending' and
 * nothing is bought from the supplier until someone confirms them.
 */
export type ReviewStatus = 'pending' | 'confirmed' | 'on_hold' | 'cancelled'
export type ReviewAction = 'confirm' | 'hold' | 'cancel'

export interface OrderReview {
  status: ReviewStatus
  at: string | null
  note: string | null
}

/** Operator view: the public fields plus how it was paid and what to buy. */
export interface AdminOrder extends Order {
  payment: OrderPayment | null
  items: OrderItem[]
  review: OrderReview | null
  promo: OrderPromo | null
  supplier: OrderSupplier | null
}

/** The order placed with the supplier for this customer order. */
export interface OrderSupplier {
  status: 'placing' | 'placed' | 'failed'
  orderIds: string[]
  error: string | null
  /** What the supplier charged to ship to the Dubai warehouse, in US$. */
  dubaiShipUsd: number | null
}

/** A promo code the customer used; the discount came off the product prices. */
export interface OrderPromo {
  code: string
  discountUgx: number
}

const REVIEW_STATUSES: readonly string[] = ['pending', 'confirmed', 'on_hold', 'cancelled']

// Which decisions are allowed from which state. A cancelled order is final,
// and a confirmed one can't be put back on hold once it may have been bought.
const REVIEW_TRANSITIONS: Record<ReviewAction, { to: ReviewStatus; from: ReviewStatus[] }> = {
  confirm: { to: 'confirmed', from: ['pending', 'on_hold'] },
  hold: { to: 'on_hold', from: ['pending'] },
  cancel: { to: 'cancelled', from: ['pending', 'on_hold'] },
}

type OrderRow = {
  id: string
  tracking_id: string
  customer_name: string
  phone: string
  website_shipped_from: string
  billing_ugx: number
  current_stage_index: number
  status_history: StatusHistoryEntry[] | string
  expected_delivery: string | null
  created_at: string | Date
  payment_method?: string | null
  payment_ref?: string | null
  paid_at?: string | Date | null
  order_items?: OrderItem[] | string | null
  admin_status?: string | null
  admin_status_at?: string | Date | null
  admin_note?: string | null
  promo_code?: string | null
  discount_ugx?: number | string | null
  supplier_status?: string | null
  supplier_order_ids?: string | null
  supplier_error?: string | null
  supplier_ship_usd?: number | string | null
}

const PAYMENT_METHODS: readonly string[] = ['mtn', 'airtel', 'card']

// The storefront's payment and item detail lives in extra columns added after
// launch. They are created on first use so deploying never depends on someone
// remembering to run a migration, and if that fails we fall back to the original
// columns rather than refusing to record a paid order.
let columnsReady: Promise<boolean> | null = null

function ensureOrderColumns(): Promise<boolean> {
  if (!columnsReady) {
    columnsReady = (async () => {
      try {
        const sql = getSql()
        await sql`
          ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_method TEXT,
            ADD COLUMN IF NOT EXISTS payment_ref TEXT,
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS order_items JSONB,
            ADD COLUMN IF NOT EXISTS admin_status TEXT,
            ADD COLUMN IF NOT EXISTS admin_status_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS admin_note TEXT,
            ADD COLUMN IF NOT EXISTS promo_code TEXT,
            ADD COLUMN IF NOT EXISTS discount_ugx BIGINT,
            ADD COLUMN IF NOT EXISTS supplier_status TEXT,
            ADD COLUMN IF NOT EXISTS supplier_order_ids TEXT,
            ADD COLUMN IF NOT EXISTS supplier_error TEXT,
            ADD COLUMN IF NOT EXISTS supplier_ship_usd NUMERIC
        `
        return true
      } catch (error) {
        console.error('Could not add order payment columns', error)
        columnsReady = null
        return false
      }
    })()
  }
  return columnsReady
}

function normalizeTrackingId(value: string) {
  return value.trim().replace(/^#/, '')
}

function trackingIdsMatch(a: string, b: string) {
  return normalizeTrackingId(a).toLowerCase() === normalizeTrackingId(b).toLowerCase()
}

function rowToOrder(row: OrderRow): Order {
  const history =
    typeof row.status_history === 'string'
      ? (JSON.parse(row.status_history) as StatusHistoryEntry[])
      : row.status_history

  return {
    id: row.id,
    trackingId: row.tracking_id,
    customerName: row.customer_name,
    phone: row.phone,
    websiteShippedFrom: row.website_shipped_from,
    billingUgx: Number(row.billing_ugx),
    currentStageIndex: row.current_stage_index,
    statusHistory: history,
    expectedDelivery: row.expected_delivery
      ? new Date(row.expected_delivery).toISOString()
      : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function rowToAdminOrder(row: OrderRow): AdminOrder {
  const items =
    typeof row.order_items === 'string'
      ? (JSON.parse(row.order_items) as OrderItem[])
      : row.order_items ?? []
  const method = row.payment_method && PAYMENT_METHODS.includes(row.payment_method)
    ? (row.payment_method as PaymentMethod)
    : null

  return {
    ...rowToOrder(row),
    payment:
      method || row.payment_ref || row.paid_at
        ? {
            method,
            ref: row.payment_ref ?? null,
            paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
          }
        : null,
    items,
    review:
      row.admin_status && REVIEW_STATUSES.includes(row.admin_status)
        ? {
            status: row.admin_status as ReviewStatus,
            at: row.admin_status_at ? new Date(row.admin_status_at).toISOString() : null,
            note: row.admin_note ?? null,
          }
        : null,
    promo: row.promo_code
      ? { code: row.promo_code, discountUgx: Number(row.discount_ugx) || 0 }
      : null,
    supplier:
      row.supplier_status === 'placing' || row.supplier_status === 'placed' || row.supplier_status === 'failed'
        ? {
            status: row.supplier_status,
            orderIds: row.supplier_order_ids ? row.supplier_order_ids.split(',').filter(Boolean) : [],
            error: row.supplier_error ?? null,
            dubaiShipUsd: row.supplier_ship_usd == null ? null : Number(row.supplier_ship_usd),
          }
        : null,
  }
}

async function listOrderRows() {
  await ensureOrderColumns()
  const sql = getSql()
  const rows = await sql`
    SELECT *
    FROM orders
    ORDER BY created_at DESC
  `
  return rows as OrderRow[]
}

/** Admin only — includes payment and item detail. */
export async function listOrders() {
  return (await listOrderRows()).map(rowToAdminOrder)
}

/** Public tracking lookup. Maps rows to the public shape so nothing private can leak. */
export async function findOrderByQuery(query: string) {
  const trackingQuery = query.trim().replace(/^#/, '').replace(/^order\s*/i, '')
  const digits = query.replace(/\D/g, '')
  const orders = (await listOrderRows()).map(rowToOrder)

  return (
    orders.find((order) => {
      if (trackingQuery && trackingIdsMatch(order.trackingId, trackingQuery)) {
        return true
      }

      const orderDigits = order.phone.replace(/\D/g, '')
      return (
        (digits.length >= 4 && orderDigits.endsWith(digits.slice(-9))) ||
        orderDigits === digits
      )
    }) ?? null
  )
}

export async function createOrder(input: {
  customerName: string
  trackingId: string
  phone: string
  websiteShippedFrom: string
  billingUgx: number
  payment?: { method: PaymentMethod | null; ref: string | null; paidAt: string | null }
  items?: OrderItem[]
  promo?: OrderPromo
}) {
  const trackingId = normalizeTrackingId(input.trackingId)
  if (!trackingId) {
    return { error: 'Enter an order number.' as const }
  }

  const sql = getSql()
  const existing = await sql`
    SELECT id FROM orders WHERE LOWER(tracking_id) = LOWER(${trackingId}) LIMIT 1
  `
  if (existing.length > 0) {
    return { error: 'That order number is already in use.' as const }
  }

  const now = new Date().toISOString()
  const history: StatusHistoryEntry[] = [{ stageIndex: 0, timestamp: now }]

  const hasDetail = Boolean(input.payment || input.items?.length)
  const detailColumns = hasDetail && (await ensureOrderColumns())

  const rows = detailColumns
    ? await sql`
        INSERT INTO orders (
          tracking_id,
          customer_name,
          phone,
          website_shipped_from,
          billing_ugx,
          current_stage_index,
          status_history,
          created_at,
          payment_method,
          payment_ref,
          paid_at,
          order_items,
          admin_status,
          promo_code,
          discount_ugx
        )
        VALUES (
          ${trackingId},
          ${input.customerName.trim()},
          ${input.phone.trim()},
          ${input.websiteShippedFrom.trim()},
          ${input.billingUgx},
          0,
          ${JSON.stringify(history)}::jsonb,
          ${now},
          ${input.payment?.method ?? null},
          ${input.payment?.ref ?? null},
          ${input.payment?.paidAt ?? null},
          ${JSON.stringify(input.items ?? [])}::jsonb,
          ${input.payment ? 'pending' : null},
          ${input.promo?.code ?? null},
          ${input.promo?.discountUgx ?? null}
        )
        RETURNING *
      `
    : await sql`
        INSERT INTO orders (
          tracking_id,
          customer_name,
          phone,
          website_shipped_from,
          billing_ugx,
          current_stage_index,
          status_history,
          created_at
        )
        VALUES (
          ${trackingId},
          ${input.customerName.trim()},
          ${input.phone.trim()},
          ${input.websiteShippedFrom.trim()},
          ${input.billingUgx},
          0,
          ${JSON.stringify(history)}::jsonb,
          ${now}
        )
        RETURNING *
      `

  return { order: rowToAdminOrder(rows[0] as OrderRow) }
}

export async function advanceOrder(id: string, note?: string) {
  const sql = getSql()
  const rows = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return null

  const order = rowToAdminOrder(rows[0] as OrderRow)
  if (order.currentStageIndex >= LAST_STAGE_INDEX) return order

  const nextStage = order.currentStageIndex + 1
  const now = new Date().toISOString()
  const statusHistory = [
    ...order.statusHistory.filter((entry) => entry.stageIndex !== nextStage),
    { stageIndex: nextStage, timestamp: now, note: note?.trim() },
  ]

  const updated = await sql`
    UPDATE orders
    SET
      current_stage_index = ${nextStage},
      status_history = ${JSON.stringify(statusHistory)}::jsonb
    WHERE id = ${id}
    RETURNING *
  `

  return rowToAdminOrder(updated[0] as OrderRow)
}

export async function updateOrderBilling(id: string, billingUgx: number) {
  const sql = getSql()
  const rows = await sql`
    UPDATE orders
    SET billing_ugx = ${billingUgx}
    WHERE id = ${id}
    RETURNING *
  `
  if (rows.length === 0) return null
  return rowToAdminOrder(rows[0] as OrderRow)
}

/**
 * Record the operator's decision. Guarded on the current status so a double
 * click or two operators at once can't, say, confirm an order already cancelled.
 *
 * @returns the updated order, 'not_found', or 'invalid' when the order isn't in
 *          a state that allows this action.
 */
export async function reviewOrder(id: string, action: ReviewAction, note?: string) {
  const rule = REVIEW_TRANSITIONS[action]
  await ensureOrderColumns()
  const sql = getSql()
  const rows = await sql`
    UPDATE orders
    SET admin_status = ${rule.to},
        admin_status_at = now(),
        admin_note = ${note?.trim() ? note.trim().slice(0, 500) : null}
    WHERE id = ${id}
      AND admin_status = ANY(${rule.from})
    RETURNING *
  `
  if (rows.length) return rowToAdminOrder(rows[0] as OrderRow)
  const exists = await sql`SELECT 1 FROM orders WHERE id = ${id} LIMIT 1`
  return exists.length ? ('invalid' as const) : ('not_found' as const)
}

export async function deleteOrder(id: string) {
  const sql = getSql()
  await sql`DELETE FROM orders WHERE id = ${id}`
}

/** The order's current state, for actions that must check it first. */
export async function getAdminOrder(id: string) {
  await ensureOrderColumns()
  const rows = await getSql()`SELECT * FROM orders WHERE id = ${id} LIMIT 1`
  return rows.length ? rowToAdminOrder(rows[0] as OrderRow) : null
}

/** Record what the shop reported back after placing (or failing to place) the supplier order. */
export async function setSupplierResult(
  id: string,
  supplier: { status: string; orderIds: string[]; error: string | null; dubaiShipUSD?: number | null },
) {
  await ensureOrderColumns()
  const rows = await getSql()`
    UPDATE orders
       SET supplier_status = ${supplier.status},
           supplier_order_ids = ${supplier.orderIds.join(',') || null},
           supplier_error = ${supplier.error},
           supplier_ship_usd = ${supplier.dubaiShipUSD ?? null}
     WHERE id = ${id}
    RETURNING *
  `
  return rows.length ? rowToAdminOrder(rows[0] as OrderRow) : null
}
