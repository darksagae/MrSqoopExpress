import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/auth.js'
import { advanceOrder, deleteOrder, reviewOrder, updateOrderBilling, type ReviewAction } from '../_lib/orders.js'
import { sendOrderStatusPush } from '../_lib/push.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) {
    return res.status(400).json({ error: 'Missing order id.' })
  }

  try {
    if (req.method === 'PATCH') {
      // Operator decision on a paid order: confirm, hold or cancel.
      if (req.body?.review !== undefined) {
        const action = String(req.body.review) as ReviewAction
        if (!['confirm', 'hold', 'cancel'].includes(action)) {
          return res.status(400).json({ error: 'Unknown review action.' })
        }
        const reviewed = await reviewOrder(id, action, req.body.note)
        if (reviewed === 'not_found') return res.status(404).json({ error: 'Order not found.' })
        if (reviewed === 'invalid') {
          return res.status(409).json({ error: 'This order can no longer be changed that way. Refresh to see its current status.' })
        }

        // Confirming starts processing, which the customer sees on their tracking page.
        let order = reviewed
        if (action === 'confirm' && reviewed.currentStageIndex === 0) {
          order = (await advanceOrder(id, 'Confirmed by MrSqoopExpress')) ?? reviewed
          try {
            await sendOrderStatusPush(order)
          } catch (pushError) {
            console.error('Order status push failed', pushError)
          }
        }
        return res.status(200).json({ order })
      }

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
