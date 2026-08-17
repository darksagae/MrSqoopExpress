import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPasswordResetToken } from '../_lib/auth.js'
import { sendEmail } from '../_lib/email.js'

const ADMIN_CONTACT_EMAIL = process.env.ADMIN_CONTACT_EMAIL ?? 'info@mrsqoopexpress.com'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = await createPasswordResetToken()
    const adminSiteUrl = (process.env.VITE_ADMIN_SITE_URL ?? 'https://control.mrsqoopexpress.com').replace(
      /\/$/,
      '',
    )
    const resetLink = `${adminSiteUrl}/?reset_token=${token}`

    await sendEmail({
      to: ADMIN_CONTACT_EMAIL,
      subject: 'Reset your Mr Sqoop Express admin username & password',
      html: `
        <p>A password reset was requested for the Mr Sqoop Express admin dashboard.</p>
        <p><a href="${resetLink}">Click here to set a new username and password</a></p>
        <p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>
      `,
    })

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Forgot password failed', error)
    return res.status(500).json({ error: 'Could not send reset email.' })
  }
}
