import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/auth.js'
import { advanceOrder, deleteOrder, updateOrderBilling } from '../_lib/orders.js'
import { sendOrderStatusPush } from '../_lib/push.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) {
    return res.status(400).json({ error: 'Missing order id.' })
  }

  try {
    if (req.method === 'PATCH') {
      if (req.body?.billingUgx !== undefined) {
        const amount = Number(req.body.billingUgx)
        if (!Number.isFinite(amount) || amount < 0) {
          return res.status(400).json({ error: 'Invalid billing amount.' })
        }
        const order = await updateOrderBilling(id, amount)
        if (!order) {
          return res.status(404).json({ error: 'Order not found.' })
        }
        return res.status(200).json({ order })
      }

      const order = await advanceOrder(id, req.body?.note)
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' })
      }
      // Best-effort push notification to the customer's subscribed devices.
      // Never let a push failure block the status update response.
      try {
        await sendOrderStatusPush(order)
      } catch (pushError) {
        console.error('Order status push failed', pushError)
      }
      return res.status(200).json({ order })
    }

    if (req.method === 'DELETE') {
      await deleteOrder(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Order mutation failed', error)
    return res.status(500).json({ error: 'Order request failed.' })
  }
}
