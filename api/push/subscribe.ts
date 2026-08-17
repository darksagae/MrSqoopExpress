import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getVapidPublicKey, saveSubscription } from '../_lib/push.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const publicKey = getVapidPublicKey()
    if (!publicKey) {
      return res.status(503).json({ error: 'Push notifications are not configured.' })
    }
    return res.status(200).json({ publicKey })
  }

  if (req.method === 'POST') {
    const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : ''
    const subscription = req.body?.subscription

    if (!orderId) {
      return res.status(400).json({ error: 'Missing order id.' })
    }
    if (
      !subscription ||
      typeof subscription.endpoint !== 'string' ||
      typeof subscription.keys?.p256dh !== 'string' ||
      typeof subscription.keys?.auth !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid push subscription.' })
    }

    try {
      await saveSubscription(orderId, subscription)
      return res.status(201).json({ ok: true })
    } catch (error) {
      console.error('Failed to save push subscription', error)
      return res.status(500).json({ error: 'Could not save subscription.' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
