import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOrder, type OrderItem, type PaymentMethod } from '../_lib/orders.js'
import { getSql } from '../_lib/db.js'
import { sendEmail } from '../_lib/email.js'

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

    // Tell the operator a paid order is waiting. Best-effort: the order is saved
    // whether or not the email goes out.
    const to = process.env.ADMIN_CONTACT_EMAIL
    if (to && process.env.RESEND_API_KEY) {
      await sendEmail({ to, subject: `New paid order ${result.order.trackingId}`, html: adminOrderEmail(req.body ?? {}, result.order.trackingId) })
        .catch((error) => console.error('Admin order email failed', error))
    }

    return res.status(201).json({ ok: true, trackingId: result.order.trackingId })
  } catch (error) {
    console.error('Order ingest failed', error)
    return res.status(500).json({ error: 'Ingest failed.' })
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const money = (n: unknown) => 'UGX ' + Math.round(Number(n) || 0).toLocaleString('en-US')
const METHOD_LABEL: Record<string, string> = { mtn: 'MTN Mobile Money', airtel: 'Airtel Money', card: 'Bank card' }

function adminOrderEmail(body: Record<string, unknown>, trackingId: string) {
  const items = cleanItems(body.items)
  const lines = items
    .map((i) => `<li>${i.qty} × ${esc(i.name)} — ${money(i.unitUgx)} each${i.productId ? ` (product ${esc(i.productId)}${i.skuId ? `, option ${esc(i.skuId)}` : ''})` : ''}</li>`)
    .join('')
  const site = process.env.VITE_ADMIN_SITE_URL || 'https://control.mrsqoopexpress.com'
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;color:#111">
    <h2 style="margin:0 0 8px">New paid order ${esc(trackingId)}</h2>
    <p style="margin:0 0 12px;color:#555">Waiting for your confirmation in the admin.</p>
    <p><strong>Customer:</strong> ${esc(body.customerName)} · ${esc(body.phone)}<br>
       <strong>Paid:</strong> ${money(body.billingUgx)} by ${esc(METHOD_LABEL[String(body.paymentMethod)] ?? body.paymentMethod ?? 'mobile money')}
       ${body.paymentRef ? `<br><strong>Payment ref:</strong> ${esc(body.paymentRef)}` : ''}
       ${body.promoCode ? `<br><strong>Promo:</strong> ${esc(body.promoCode)} (−${money(body.discountUgx)})` : ''}</p>
    <ul>${lines}</ul>
    <p><a href="${esc(site)}" style="background:#E8B923;color:#000;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Open the admin</a></p>
  </div>`
}
