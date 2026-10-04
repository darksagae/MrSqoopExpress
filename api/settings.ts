import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'

/**
 * GET / PUT /api/settings  (admin only)
 *
 * The shop's exchange rate, handling-fee percentage and promo banner. The shop
 * owns and applies them; this endpoint is the admin's door to it, signing the
 * call with the shared ingest secret so the browser never holds that secret.
 */
const SHOP_URL = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const secret = process.env.ORDER_INGEST_SECRET
  if (!secret) return res.status(503).json({ error: 'Shop connection is not configured.' })
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(`${SHOP_URL}/api/admin/settings`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: req.method === 'PUT' ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (error) {
    console.error('Settings proxy failed', error)
    return res.status(502).json({ error: 'Could not reach the shop. Try again.' })
  }
}
