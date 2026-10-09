import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/auth.js'
import {
  advanceOrder,
  deleteOrder,
  getAdminOrder,
  reviewOrder,
  setSupplierResult,
  updateOrderBilling,
  type ReviewAction,
} from '../_lib/orders.js'
import { sendOrderStatusPush } from '../_lib/push.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) {
    return res.status(400).json({ error: 'Missing order id.' })
  }

  try {
    if (req.method === 'PATCH') {
      // Place the confirmed order with the supplier, shipped to the Dubai
      // warehouse. The shop does the ordering (it holds the supplier
      // credentials) and refuses to order the same thing twice.
      if (req.body?.placeSupplier === true) {
        const current = await getAdminOrder(id)
        if (!current) return res.status(404).json({ error: 'Order not found.' })
        if (current.review?.status !== 'confirmed') {
          return res.status(409).json({ error: 'Confirm the order before placing it with the supplier.' })
        }
        const secret = process.env.ORDER_INGEST_SECRET
        if (!secret) return res.status(503).json({ error: 'Shop connection is not configured.' })
        const shop = (process.env.SHOP_API_URL || 'https://www.mrsqoopexpress.com').replace(/\/$/, '')
        const preview = req.body?.preview === true
        let data: {
          ok?: boolean
          error?: string
          supplier?: { status: string; orderIds: string[]; error: string | null; dubaiShipUSD?: number | null }
          [key: string]: unknown
        } = {}
        try {
          const upstream = await fetch(`${shop}/api/admin/supplier-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
            body: JSON.stringify({ orderId: current.trackingId, preview }),
            signal: AbortSignal.timeout(55_000),
          })
          data = (await upstream.json().catch(() => ({}))) as typeof data
        } catch {
          return res.status(502).json({ error: 'Could not reach the shop. Try again.' })
        }
        // A preview only quotes the Dubai shipping; nothing is ordered or stored.
        if (preview) {
          if (!data.ok) return res.status(502).json({ error: data.error || 'Could not get the Dubai shipping quote.' })
          return res.status(200).json({ quote: data })
        }
        const order = data.supplier ? await setSupplierResult(id, data.supplier) : current
        if (!data.ok) {
          return res.status(502).json({ error: data.error || data.supplier?.error || 'The supplier order was not placed.', order })
        }
        return res.status(200).json({ order })
      }

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
