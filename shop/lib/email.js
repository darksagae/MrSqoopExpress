/**
 * Transactional email via Resend (https://resend.com).
 *
 * Env:
 *   RESEND_API_KEY  — your Resend API key
 *   EMAIL_FROM      — verified sender, e.g. "MrSqoopExpress <noreply@mrsqoopexpress.com>"
 *   APP_URL         — public base URL for links (defaults to the live domain)
 */

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'MrSqoopExpress <noreply@mrsqoopexpress.com>';
export const APP_URL = process.env.APP_URL || 'https://ali.mrsqoopexpress.com';

export function isEmailConfigured() {
  return Boolean(API_KEY);
}

/** Low-level send. Throws on non-2xx so callers can react. */
async function send({ to, subject, html }) {
  if (!API_KEY) {
    const err = new Error('RESEND_API_KEY is not set — cannot send email.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Resend send failed (${res.status}): ${text.slice(0, 200)}`);
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }
  return res.json();
}

/** Send the "confirm your email" message with a 6-digit code to enter. */
export async function sendVerificationEmail({ to, name, code }) {
  const hi = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const html = `
  <div style="font-family:Jost,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:22px;margin:0 0 4px">MrSqoopExpress</h1>
    <p style="color:#666;font-size:13px;margin:0 0 24px">Express Tech Shop</p>
    <p>${hi}</p>
    <p>Enter this code to confirm your email and activate your account:</p>
    <div style="margin:24px 0;text-align:center">
      <span style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:10px;background:#f4f4f4;border-radius:12px;padding:16px 24px">${escapeHtml(code)}</span>
    </div>
    <p style="color:#666;font-size:13px">This code expires in 1 hour. If you didn’t create an account, you can ignore this email.</p>
  </div>`;
  return send({ to, subject: `${code} is your MrSqoopExpress confirmation code`, html });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
