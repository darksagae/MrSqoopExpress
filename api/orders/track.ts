import type { VercelRequest, VercelResponse } from '@vercel/node'
import { findOrderByQuery } from '../_lib/orders.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const query = typeof req.query.q === 'string' ? req.query.q : ''
    if (!query.trim()) {
      return res.status(400).json({ error: 'Missing search query.' })
    }

    res.setHeader('Cache-Control', 'no-store')
    let order = await findOrderByQuery(query)
    // Canonical shipping progress always wins. Unsynced shop orders remain
    // searchable without signing in, via the existing shared server secret.
    const phoneQuery = /^\+?[\d\s()-]+$/.test(query.trim()) && /^(?:0|256)?7\d{8}$/.test(query.replace(/\D/g, ''))
    if (!order || phoneQuery) {
      const secret = process.env.ORDER_INGEST_SECRET
      if (!secret && !order) return res.status(503).json({ error: 'Shop tracking is not configured.' })
      if (secret) {
        const base = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')
        try {
          const upstream = await fetch(`${base}/api/admin/tracking?q=${encodeURIComponent(query)}`, {
            headers: { 'x-ingest-secret': secret }, signal: AbortSignal.timeout(8000), redirect: 'error',
          })
          if (upstream.ok) {
            const candidate = (await upstream.json()).order
            if (candidate && (!order || new Date(candidate.createdAt).getTime() > new Date(order.createdAt).getTime())) {
              order = await findOrderByQuery(candidate.trackingId) || candidate
            }
          } else if (!order && upstream.status !== 404) {
            return res.status(502).json({ error: 'Shop tracking is temporarily unavailable.' })
          }
        } catch {
          if (!order) return res.status(502).json({ error: 'Shop tracking is temporarily unavailable.' })
        }
      }
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' })
    }

    return res.status(200).json({ order })
  } catch (error) {
    console.error('Track handler failed', error)
    return res.status(500).json({ error: 'Track request failed.' })
  }
}
