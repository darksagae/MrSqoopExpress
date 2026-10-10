import crypto from 'crypto';
import { checkPaymentStatus, startMobileMoneyOrder } from '@/lib/checkout';
import { getOrder, listOrdersForUser } from '@/lib/orders';
import { detectNetwork } from '@/lib/payments/networks';
import { NETWORK_LABEL, resolveProvider } from '@/lib/payments/resolve';
import { CartProblem, priceCart } from '@/lib/pricing';
import { toTimeline } from '@/lib/timeline';
import { shillings, shortTitle } from './voice';

/**
 * Sqoop Assist acting for the signed-in customer: their orders, placing an
 * order and charging their Mobile Money. Every function takes the account the
 * request was signed in as, and only ever touches that account's orders.
 *
 * Ordering is two steps so a misheard word can never spend money:
 * prepareOrder prices the order and reads it back, and placeOrder only runs
 * with the signed confirmation that prepareOrder returned, after the customer
 * says yes. Even then the customer approves the charge with their own Mobile
 * Money PIN on their phone; the assistant can't do that part for them.
 */

const CONFIRM_TTL_MS = 10 * 60 * 1000;
const SIGN_IN = 'To order with your voice, please sign in to Mr Sqoop Express first, then ask me again.';

function confirmSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.ORDER_INGEST_SECRET || '';
}

function signConfirmation(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', confirmSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readConfirmation(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac || !confirmSecret()) return null;
  const want = crypto.createHmac('sha256', confirmSecret()).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** "0772123456" -> "0 7 7 2, 1 2 3, 4 5 6" reads digit by digit, like a person would. */
function spokenPhone(phone) {
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('256')) p = '0' + p.slice(3);
  return [p.slice(0, 4), p.slice(4, 7), p.slice(7)].filter(Boolean).map((g) => g.split('').join(' ')).join(', ');
}

/** Name and phone from the customer's latest order, used when they don't give new ones. */
async function lastDetails(account) {
  const [latest] = await listOrdersForUser(account.id, { limit: 1 }).catch(() => []);
  return { name: latest?.customer_name || null, phone: latest?.customer_phone || null };
}

function displayName(account, fallback) {
  return account.name || fallback || String(account.email || 'Customer').split('@')[0];
}

export async function myOrders(account) {
  if (!account) return { speech: SIGN_IN, data: { signIn: true } };
  const rows = await listOrdersForUser(account.id, { limit: 5 });
  if (!rows.length) return { speech: "You don't have any orders yet. Ask me to find something and I can order it for you." };
  const orders = rows.map((o) => ({
    id: o.id,
    statusLabel: toTimeline(o).statusLabel,
    amountUGX: Number(o.amount_ugx),
    items: (o.items || []).map((i) => ({ name: shortTitle(i.name), qty: i.qty })),
  }));
  const lines = orders.slice(0, 3).map((o) => {
    const what = o.items.length === 1 && o.items[0].name ? o.items[0].name : `${o.items.length} ${o.items.length === 1 ? 'item' : 'items'}`;
    return `${o.id}, ${what}, ${shillings(o.amountUGX)}, ${o.statusLabel.toLowerCase()}`;
  });
  return { speech: `Your latest orders: ${lines.join('. ')}.`, data: { orders } };
}

/**
 * Price an order for the customer and read it back. Nothing is charged.
 * items: [{ product_id, quantity }]
 */
export async function prepareOrder(account, { items, phone, promo_code }) {
  if (!account) return { speech: SIGN_IN, data: { signIn: true } };

  const cart = (items || []).map((i) => ({ id: String(i.product_id), qty: Math.max(1, Math.round(Number(i.quantity) || 1)) }));
  const last = await lastDetails(account);
  const payPhone = phone || last.phone;
  if (!payPhone) {
    return {
      speech: 'Which Mobile Money number should I send the payment request to? Say it like 0 7 7 2, 1 2 3, 4 5 6.',
      data: { needPhone: true, items },
    };
  }
  const network = detectNetwork(payPhone);
  if (!network) {
    return {
      speech: "That doesn't sound like an MTN or Airtel Uganda number. Please say the number you pay with.",
      data: { needPhone: true, items },
    };
  }
  if (!resolveProvider(network).ready) {
    return { speech: `${NETWORK_LABEL[network]} payments aren't available right now. Please try again a little later.` };
  }

  let priced;
  try {
    priced = await priceCart(cart, { promoCode: promo_code });
  } catch (e) {
    if (e instanceof CartProblem) return { speech: e.message };
    console.error('[assist] could not price order:', e.code, e.message);
    return { speech: "I couldn't confirm today's price just now. Please ask me again in a moment." };
  }

  if (!confirmSecret()) {
    console.error('[assist] no AUTH_SECRET/ORDER_INGEST_SECRET: voice ordering is off');
    return { speech: "Voice ordering isn't switched on yet. You can order on the website for now." };
  }
  const now = Date.now();
  const confirmation = signConfirmation({
    u: account.id,
    i: cart,
    p: payPhone,
    n: network,
    t: priced.total,
    c: priced.promo?.code || null,
    s: now,
    x: now + CONFIRM_TTL_MS,
  });

  const what = priced.lines.map((l) => `${l.qty} ${shortTitle(l.name)}`).join(', and ');
  const discount = priced.promo ? ` after your ${shillings(priced.promo.discountUGX)} discount` : '';
  return {
    speech:
      `Here's your order: ${what}. The total is ${shillings(priced.total)} delivered to Uganda${discount}. ` +
      `I'll send an ${NETWORK_LABEL[network]} payment request to ${spokenPhone(payPhone)}. Shall I place the order?`,
    data: {
      confirmation,
      order: {
        lines: priced.lines.map((l) => ({ name: shortTitle(l.name, 10), qty: l.qty, img: l.img, totalUGX: l.qty * (l.price + l.shipUGX + l.handlingUGX) })),
        totalUGX: priced.total,
        network,
        phone: payPhone,
      },
    },
  };
}

/** Place the order prepareOrder read back, and send the payment prompt to the customer's phone. */
export async function placeOrder(account, { confirmation }) {
  if (!account) return { speech: SIGN_IN, data: { signIn: true } };
  const c = readConfirmation(confirmation);
  if (!c || c.u !== account.id) return { speech: "I couldn't confirm that order. Please ask me to order it again." };
  if (Date.now() > c.x) return { speech: 'That order summary has expired. Ask me to order it again and I will re-check the price.' };

  // Saying "yes" twice must not charge twice: an order matching this summary,
  // placed since it was read back, is the same order.
  const recent = await listOrdersForUser(account.id, { limit: 5 }).catch(() => []);
  const ids = (list) => list.map((i) => `${String(i.id).split(':')[0]}x${i.qty}`).sort().join(',');
  const dup = recent.find(
    (o) => new Date(o.created_at).getTime() >= c.s && Number(o.amount_ugx) === c.t && ids(o.items || []) === ids(c.i)
  );
  if (dup) {
    return {
      speech: `I've already placed that order, ${dup.id}. Check your phone for the payment request.`,
      data: { orderId: dup.id, network: dup.network },
    };
  }

  const last = await lastDetails(account);
  const result = await startMobileMoneyOrder({
    account,
    customer: { name: displayName(account, last.name), phone: c.p },
    network: c.n,
    items: c.i,
    total: c.t,
    promoCode: c.c,
  });
  const b = result.body;
  if (result.status === 200) {
    return {
      speech:
        `Done. Your order ${b.orderId} is placed. I've sent a payment request for ${shillings(b.amountUGX)} to ${spokenPhone(c.p)}. ` +
        'Enter your Mobile Money PIN on your phone to approve it, then ask me if your payment went through.',
      data: { orderId: b.orderId, network: b.network, amountUGX: b.amountUGX },
    };
  }
  if (b.code === 'PRICE_CHANGED') {
    return { speech: `The price just changed to ${shillings(b.total)}. Ask me to order it again to confirm the new price.` };
  }
  return { speech: b.error || "I couldn't place that order. Please try again." };
}

/** Whether the customer's payment for one of their orders went through. */
export async function paymentStatus(account, { order_id }) {
  if (!account) return { speech: SIGN_IN, data: { signIn: true } };
  const order = await getOrder(String(order_id || '').trim().toUpperCase());
  if (!order || order.user_id !== account.id) return { speech: `I couldn't find order ${order_id} on your account.` };

  let state = order.payment_status;
  if (state === 'PENDING' && order.payment_ref) {
    const r = await checkPaymentStatus(order.network, order.payment_ref);
    if (r.status === 200 && r.body.settled) state = r.body.paid ? 'SUCCESSFUL' : 'FAILED';
  }
  const data = { orderId: order.id, paymentStatus: state };
  if (state === 'SUCCESSFUL') {
    return { speech: `Payment received for order ${order.id}. Thank you! We'll let you know when it's on the way.`, data };
  }
  if (state === 'FAILED') {
    return { speech: `The payment for order ${order.id} didn't go through. Ask me to order it again and I'll send a new request.`, data };
  }
  return {
    speech: `I'm still waiting for your approval on order ${order.id}. Check your phone for the Mobile Money prompt and enter your PIN.`,
    data,
  };
}
