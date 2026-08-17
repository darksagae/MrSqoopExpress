import type { VercelRequest, VercelResponse } from '@vercel/node'
import { consumePasswordResetToken, setAdminCredentials } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { token, username, password } = req.body ?? {}

    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'Missing reset token.' })
    }
    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    }

    const validToken = await consumePasswordResetToken(token)
    if (!validToken) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' })
    }

    await setAdminCredentials(username.trim(), password)

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Reset password failed', error)
    return res.status(500).json({ error: 'Could not reset credentials.' })
  }
}
