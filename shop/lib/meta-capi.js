import crypto from 'crypto';
import { currentSettings, loadSettings } from './settings.js';
import { isTestRef } from './test-checkout.js';

/**
 * Meta Conversions API: the shop's server tells Meta about a purchase itself.
 *
 * A Mobile Money customer approves the payment on their phone and often never
 * returns to the page, and ad blockers stop the browser pixel, so the browser
 * alone would miss many sales. The server sends Purchase at the one moment a
 * payment is confirmed (settlePayment), using the order number as the event ID
 * so the browser's copy, when there is one, is counted once.
 *
 * Sent: the amount in UGX and the products, plus the customer's email and phone
 * hashed (SHA-256, as Meta requires), and the browser cookies Meta set, so the
 * sale can be matched to the ad. Never: the warehouse, the supplier, or
 * anything unhashed about the customer. Test orders and customers who said
 * "No thanks" to tracking are not sent at all.
 */
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const SITE = 'https://www.mrsqoopexpress.com';
const OPT_OUT_COOKIE = 'mse_no_ads';

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Ugandan number in international form without "+": 256XXXXXXXXX. */
function intlPhone(phone) {
  const p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('256') && p.length === 12) return p;
  if (p.startsWith('0') && p.length === 10) return '256' + p.slice(1);
  if (p.length === 9) return '256' + p;
  return null;
}

/**
 * What the browser can tell us at checkout that helps Meta match a purchase to
 * an ad: its Meta cookies, address and browser. Nothing at all when the
 * customer turned tracking off.
 */
export function trackingFrom(request) {
  const cookie = (name) => request.cookies?.get?.(name)?.value || null;
  if (cookie(OPT_OUT_COOKIE) === '1') return { optOut: true };
  return {
    fbp: cookie('_fbp'),
    fbc: cookie('_fbc'),
    ip: (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
    ua: request.headers.get('user-agent') || null,
  };
}

/** The Purchase event for a paid order, in the shape the Conversions API takes. */
export function purchaseEvent(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const t = order.tracking || {};
  const productId = (i) => String(i.id ?? '').split(':')[0];
  const phone = intlPhone(order.customer_phone);
  const email = String(order.customer_email || '').trim().toLowerCase();
  return {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(order.paid_at || Date.now()).getTime() / 1000),
    event_id: order.id,
    action_source: 'website',
    event_source_url: `${SITE}/checkout`,
    user_data: {
      em: email ? [sha256(email)] : undefined,
      ph: phone ? [sha256(phone)] : undefined,
      external_id: order.user_id ? [sha256(order.user_id)] : undefined,
      country: [sha256('ug')],
      fbp: t.fbp || undefined,
      fbc: t.fbc || undefined,
      client_ip_address: t.ip || undefined,
      client_user_agent: t.ua || undefined,
    },
    custom_data: {
      currency: 'UGX',
      value: Number(order.amount_ugx) || 0,
      order_id: order.id,
      content_type: 'product',
      content_ids: items.map(productId),
      contents: items.map((i) => ({ id: productId(i), quantity: Number(i.qty) || 1, item_price: Number(i.price) || 0 })),
      num_items: items.reduce((n, i) => n + (Number(i.qty) || 1), 0),
    },
  };
}

/**
 * Report a paid order to Meta. Never throws and never holds the order up for
 * long: a tracking hiccup must not affect a confirmed payment.
 *
 * @returns {{ sent: boolean, reason?: string }}
 */
export async function sendPurchaseToMeta(order) {
  try {
    await loadSettings();
    const { meta, metaCapiToken } = currentSettings();
    if (!meta?.pixelId || !metaCapiToken) return { sent: false, reason: 'not set up' };
    if (isTestRef(order.payment_ref)) return { sent: false, reason: 'test order' };
    if (order.tracking?.optOut) return { sent: false, reason: 'customer opted out' };

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${meta.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The token goes in the body rather than the URL, so it never ends up in
      // a request log.
      body: JSON.stringify({
        data: [purchaseEvent(order)],
        access_token: metaCapiToken,
        ...(meta.testEventCode ? { test_event_code: meta.testEventCode } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[meta] purchase not accepted for', order.id, res.status, text.slice(0, 300));
      return { sent: false, reason: `meta ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[meta] could not send purchase for', order.id, e.message);
    return { sent: false, reason: e.message };
  }
}
