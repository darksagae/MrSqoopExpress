import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAdminToken, verifyAdminPassword } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { username: rawUsername, password } = req.body ?? {}

    if (typeof rawUsername !== 'string' || typeof password !== 'string') {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const username = rawUsername.trim()

    if (!(await verifyAdminPassword(username, password))) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    const token = createAdminToken(username)
    return res.status(200).json({ token })
  } catch (error) {
    console.error('Login failed', error)
    return res.status(500).json({ error: 'Login failed.' })
  }
}
