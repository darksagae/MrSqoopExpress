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

/** Operator view: the public fields plus how it was paid and what to buy. */
export interface AdminOrder extends Order {
  payment: OrderPayment | null
  items: OrderItem[]
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
            ADD COLUMN IF NOT EXISTS order_items JSONB
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
          order_items
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
          ${JSON.stringify(input.items ?? [])}::jsonb
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

export async function deleteOrder(id: string) {
  const sql = getSql()
  await sql`DELETE FROM orders WHERE id = ${id}`
}
