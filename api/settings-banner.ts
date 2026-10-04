import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'

/**
 * PUT / DELETE /api/settings-banner  (admin only)
 * Sets or removes the shop's promo banner image. The admin's browser resizes the
 * picture first; the shop checks it again before storing it.
 */
const SHOP_URL = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const secret = process.env.ORDER_INGEST_SECRET
  if (!secret) return res.status(503).json({ error: 'Shop connection is not configured.' })
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(`${SHOP_URL}/api/admin/promo-banner`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: req.method === 'PUT' ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (error) {
    console.error('Banner proxy failed', error)
    return res.status(502).json({ error: 'Could not reach the shop. Try again.' })
  }
}
