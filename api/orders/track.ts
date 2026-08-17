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

    const order = await findOrderByQuery(query)
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' })
    }

    return res.status(200).json({ order })
  } catch (error) {
    console.error('Track handler failed', error)
    return res.status(500).json({ error: 'Track request failed.' })
  }
}
