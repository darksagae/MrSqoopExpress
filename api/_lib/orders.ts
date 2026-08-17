const LAST_STAGE_INDEX = 9
import { getSql } from './db.js'

export interface StatusHistoryEntry {
  stageIndex: number
  timestamp: string
  note?: string
}

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

export async function listOrders() {
  const sql = getSql()
  const rows = await sql`
    SELECT *
    FROM orders
    ORDER BY created_at DESC
  `
  return (rows as OrderRow[]).map(rowToOrder)
}

export async function findOrderByQuery(query: string) {
  const trackingQuery = query.trim().replace(/^#/, '').replace(/^order\s*/i, '')
  const digits = query.replace(/\D/g, '')
  const orders = await listOrders()

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

  const rows = await sql`
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

  return { order: rowToOrder(rows[0] as OrderRow) }
}

export async function advanceOrder(id: string, note?: string) {
  const sql = getSql()
  const rows = await sql`SELECT * FROM orders WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return null

  const order = rowToOrder(rows[0] as OrderRow)
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

  return rowToOrder(updated[0] as OrderRow)
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
  return rowToOrder(rows[0] as OrderRow)
}

export async function deleteOrder(id: string) {
  const sql = getSql()
  await sql`DELETE FROM orders WHERE id = ${id}`
}
