import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOrder, type OrderItem, type PaymentMethod } from '../_lib/orders.js'
import { getSql } from '../_lib/db.js'

const METHODS: readonly string[] = ['mtn', 'airtel', 'card']

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const whole = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0)

/** Keep only well-formed lines and bound their size; the caller is trusted but not to be believed blindly. */
function cleanItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 50).map((i) => ({
    productId: text(i?.productId, 40),
    skuId: i?.skuId ? text(i.skuId, 40) : null,
    name: text(i?.name, 200) || 'Item',
    qty: Math.max(1, whole(i?.qty)),
    unitUgx: whole(i?.unitUgx),
    shipUgx: whole(i?.shipUgx),
    handlingUgx: whole(i?.handlingUgx),
  }))
}

function cleanPayment(body: Record<string, unknown>) {
  const method = METHODS.includes(String(body.paymentMethod)) ? (body.paymentMethod as PaymentMethod) : null
  const ref = body.paymentRef ? text(body.paymentRef, 100) : null
  const paid = body.paidAt ? new Date(String(body.paidAt)) : null
  const paidAt = paid && !Number.isNaN(paid.getTime()) ? paid.toISOString() : null
  return method || ref || paidAt ? { method, ref, paidAt } : undefined
}

/**
 * POST /api/orders/ingest
 *
 * Machine-to-machine order creation from the storefront (ali.mrsqoopexpress.com)
 * when a customer's payment succeeds. Guarded by a shared secret instead of the
 * admin session used by /api/orders. Idempotent: a repeated trackingId (e.g. the
 * status poll and the provider callback both firing) is treated as success.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.ORDER_INGEST_SECRET
  if (!secret) {
    return res.status(503).json({ error: 'Ingest not configured.' })
  }
  const provided = req.headers['x-ingest-secret']
  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  try {
    const { trackingId, customerName, phone, billingUgx, websiteShippedFrom } = req.body ?? {}
    if (!trackingId || !customerName || !phone) {
      return res.status(400).json({ error: 'Missing required order fields.' })
    }

    const result = await createOrder({
      customerName: String(customerName),
      trackingId: String(trackingId),
      phone: String(phone),
      websiteShippedFrom: String(websiteShippedFrom || 'AliExpress'),
      billingUgx: Number(billingUgx) || 0,
      payment: cleanPayment(req.body ?? {}),
      items: cleanItems(req.body?.items),
      promo: req.body?.promoCode
        ? { code: text(req.body.promoCode, 30), discountUgx: whole(req.body.discountUgx) }
        : undefined,
    })

    // Duplicate tracking id → the order already exists; report success so the
    // caller (which may retry) doesn't treat it as a failure.
    if ('error' in result) {
      const message = String(result.error ?? '')
      if (/already in use/i.test(message)) {
        // A repeat of the same order (the status poll and the provider callback
        // can both fire) is fine. A different customer's order that happens to
        // carry an order number already used here (say, one typed in by hand)
        // is not: reporting it as done would silently lose the order.
        const sql = getSql()
        const rows = (await sql`
          SELECT phone FROM orders WHERE LOWER(tracking_id) = LOWER(${String(trackingId).trim()}) LIMIT 1
        `) as { phone: string }[]
        const last9 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9)
        if (rows.length && last9(rows[0].phone) !== last9(phone)) {
          console.error('Ingest order number clash', trackingId)
          return res.status(409).json({ error: 'That order number belongs to a different order.', code: 'ID_CONFLICT' })
        }
        return res.status(200).json({ ok: true, trackingId, duplicate: true })
      }
      return res.status(400).json({ error: message })
    }

    return res.status(201).json({ ok: true, trackingId: result.order.trackingId })
  } catch (error) {
    console.error('Order ingest failed', error)
    return res.status(500).json({ error: 'Ingest failed.' })
  }
}
