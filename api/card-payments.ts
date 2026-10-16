import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'

/**
 * GET  /api/card-payments                      (admin only)
 * POST /api/card-payments { orderId, received }
 *
 * Card payments made through Absa's payment link wait here until the operator
 * has found a payment of the exact amount in Absa's portal. The shop owns the
 * orders; this endpoint is the admin's door to them, signing the call with the
 * shared ingest secret so the browser never holds it.
 */
const SHOP_URL = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const secret = process.env.ORDER_INGEST_SECRET
  if (!secret) return res.status(503).json({ error: 'Shop connection is not configured.' })
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(`${SHOP_URL}/api/admin/card-link`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (error) {
    console.error('Card payments proxy failed', error)
    return res.status(502).json({ error: 'Could not reach the shop. Try again.' })
  }
}
