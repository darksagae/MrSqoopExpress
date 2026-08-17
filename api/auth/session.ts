import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBearerToken, verifyAdminToken } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = getBearerToken(req)
    return res.status(200).json({ authenticated: await verifyAdminToken(token) })
  } catch (error) {
    console.error('Session check failed', error)
    return res.status(500).json({ error: 'Session check failed.' })
  }
}
