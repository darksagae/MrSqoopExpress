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
export const APP_URL = process.env.APP_URL || 'https://www.mrsqoopexpress.com';

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

const ugx = (n) => 'UGX ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const METHOD = { mtn: 'MTN Mobile Money', airtel: 'Airtel Money', card: 'Bank card' };

/**
 * Order confirmation to the buyer, sent once when payment is confirmed.
 * @param {object} order  the paid order row (customer_email, items, amount_ugx, ...)
 */
export async function sendOrderConfirmation(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const goods = items.reduce((t, i) => t + (i.qty || 1) * (i.price || 0), 0);
  const ship = items.reduce((t, i) => t + (i.qty || 1) * (i.shipUGX || 0), 0);
  const handling = items.reduce((t, i) => t + (i.qty || 1) * (i.handlingUGX || 0), 0);
  const discount = Number(order.discount_ugx) || 0;
  const row = (label, value, strong = false) =>
    `<tr><td style="padding:4px 0;color:${strong ? '#111' : '#555'};${strong ? 'font-weight:700' : ''}">${label}</td>` +
    `<td style="padding:4px 0;text-align:right;${strong ? 'font-weight:700' : ''}">${value}</td></tr>`;
  const lines = items.map((i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(i.name || 'Item')}<br>
        <span style="color:#777;font-size:13px">Qty ${i.qty || 1}</span></td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${ugx((i.qty || 1) * (i.price || 0))}</td>
    </tr>`).join('');
  const hi = order.customer_name ? `Hi ${escapeHtml(order.customer_name)},` : 'Hi,';
  const html = `
  <div style="font-family:Jost,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:22px;margin:0 0 4px">MrSqoopExpress</h1>
    <p style="color:#666;font-size:13px;margin:0 0 24px">You shop. We ship. You smile.</p>
    <p>${hi}</p>
    <p>Thank you for your order. Your payment has been received and we are preparing your order for delivery to Uganda.</p>
    <p style="font-size:18px;font-weight:700;margin:20px 0 8px">Order ${escapeHtml(order.id)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${lines}</table>
    <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:12px">
      ${row('Items', ugx(goods))}
      ${row('Shipping to Uganda', ship > 0 ? ugx(ship) : 'Free')}
      ${handling > 0 ? row('Handling', ugx(handling)) : ''}
      ${discount > 0 ? row(`Promo ${escapeHtml(order.promo_code || '')}`, '−' + ugx(discount)) : ''}
      ${row('Total paid', ugx(order.amount_ugx), true)}
    </table>
    <p style="color:#555;font-size:14px;margin-top:16px">Paid with ${METHOD[order.network] || 'mobile money'}.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${APP_URL}/account/orders" style="background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;display:inline-block">Track your order</a>
    </p>
    <p style="color:#777;font-size:13px">Questions? Reply to this email or write to support@mrsqoopexpress.com and quote ${escapeHtml(order.id)}.</p>
  </div>`;
  return send({ to: order.customer_email, subject: `Order ${order.id} confirmed – MrSqoopExpress`, html });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
