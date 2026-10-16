import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from './_lib/auth.js'

/**
 * GET / PUT /api/settings  (admin only)
 *
 * The shop's exchange rate, handling-fee percentage and promo banner. The shop
 * owns and applies them; this endpoint is the admin's door to it, signing the
 * call with the shared ingest secret so the browser never holds that secret.
 *
 * GET / POST /api/settings?card=1 is the same door to the card payments made
 * through Absa's payment link that wait for the operator to find them. It
 * shares this function because the Hobby plan allows 12 per deployment.
 */
const SHOP_URL = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const secret = process.env.ORDER_INGEST_SECRET
  if (!secret) return res.status(503).json({ error: 'Shop connection is not configured.' })
  const card = req.query.card === '1'
  const write = card ? 'POST' : 'PUT'
  if (req.method !== 'GET' && req.method !== write) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const upstream = await fetch(`${SHOP_URL}/api/admin/${card ? 'card-link' : 'settings'}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: req.method === write ? JSON.stringify(req.body ?? {}) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const data = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(data)
  } catch (error) {
    console.error('Settings proxy failed', error)
    return res.status(502).json({ error: 'Could not reach the shop. Try again.' })
  }
}
