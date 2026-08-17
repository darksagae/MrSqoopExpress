import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/auth.js'
import { createOrder, listOrders } from '../_lib/orders.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  try {
    if (req.method === 'GET') {
      const orders = await listOrders()
      return res.status(200).json({ orders })
    }

    if (req.method === 'POST') {
      const { customerName, trackingId, phone, websiteShippedFrom, billingUgx } = req.body ?? {}
      const amount =
        billingUgx === undefined || billingUgx === null || billingUgx === ''
          ? 0
          : Number(billingUgx)

      if (!customerName || !trackingId || !phone || !websiteShippedFrom) {
        return res.status(400).json({ error: 'Missing required order fields.' })
      }

      const result = await createOrder({
        customerName,
        trackingId,
        phone,
        websiteShippedFrom,
        billingUgx: Number.isFinite(amount) && amount > 0 ? amount : 0,
      })

      if ('error' in result) {
        return res.status(400).json({ error: result.error })
      }

      return res.status(201).json({ order: result.order })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Orders handler failed', error)
    return res.status(500).json({ error: 'Orders request failed.' })
  }
}
