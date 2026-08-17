import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOrder } from '../_lib/orders.js'

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
    })

    // Duplicate tracking id → the order already exists; report success so the
    // caller (which may retry) doesn't treat it as a failure.
    if ('error' in result) {
      const message = String(result.error ?? '')
      if (/already in use/i.test(message)) {
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
