import { getSql } from '../db.js';
import { currentSettings, loadSettings } from '../settings.js';
import { ensureAccountColumns, getOrder, settlePayment } from '../orders.js';

/**
 * Card payments through Absa's payment link (CyberSource Pay by Link), used
 * until the Secure Acceptance keys arrive (lib/payments/card.js).
 *
 * The link is one page where the customer types the amount, with no order
 * reference and no message back to us. So:
 *
 *   1. Checkout records the order as PENDING under the reference
 *      CARDLINK-<order id> and shows the exact total to type in.
 *   2. The customer pays on Absa's page and presses "I've paid".
 *   3. The admin finds a payment of exactly that amount in Absa's portal and
 *      marks it received (settlePayment, as for any payment) or not received.
 *
 * Absa's page accepts any amount; only the admin's exact-amount check lets an
 * order through.
 */
export const CARD_LINK_PREFIX = 'CARDLINK-';
export const isCardLinkRef = (ref) => String(ref || '').startsWith(CARD_LINK_PREFIX);

export async function cardPayLink() {
  await loadSettings();
  return currentSettings().cardPayLink || '';
}

/** The customer says they've paid. Only their own, still-unpaid card-link order. */
export async function markCardClaimed(orderId, userId) {
  if (!(await ensureAccountColumns())) return false;
  const rows = await getSql()`
    UPDATE orders SET card_claimed_at = COALESCE(card_claimed_at, now()), updated_at = now()
     WHERE id = ${orderId} AND user_id = ${userId}
       AND payment_status = 'PENDING' AND payment_ref LIKE ${CARD_LINK_PREFIX + '%'}
    RETURNING id
  `;
  return rows.length > 0;
}

/** Card-link orders still waiting for the admin, the ones marked paid first. */
export async function listCardLinkPending({ days = 14 } = {}) {
  if (!(await ensureAccountColumns())) return [];
  const rows = await getSql()`
    SELECT id, customer_name, customer_phone, customer_email, amount_ugx, items, created_at, card_claimed_at
      FROM orders
     WHERE payment_status = 'PENDING' AND payment_ref LIKE ${CARD_LINK_PREFIX + '%'}
       AND created_at > now() - make_interval(days => ${days})
     ORDER BY card_claimed_at DESC NULLS LAST, created_at DESC
     LIMIT 100
  `;
  return rows.map((o) => ({
    orderId: o.id,
    customerName: o.customer_name,
    phone: o.customer_phone,
    email: o.customer_email || null,
    amountUGX: Number(o.amount_ugx),
    items: (Array.isArray(o.items) ? o.items : []).map((i) => ({ name: i.name, qty: Number(i.qty) || 1 })),
    placedAt: o.created_at,
    claimedAt: o.card_claimed_at || null,
  }));
}

/**
 * The admin's answer for one card-link order. Received settles it as paid,
 * which sends it on exactly like a Mobile Money payment.
 */
export async function decideCardLink(orderId, received) {
  const order = await getOrder(orderId);
  if (!order || !isCardLinkRef(order.payment_ref)) return { ok: false, error: 'No card payment waiting for that order.' };
  if (order.payment_status !== 'PENDING') return { ok: false, error: 'This order has already been decided.' };
  const { changed } = await settlePayment(order.payment_ref, received ? 'SUCCESSFUL' : 'FAILED', {
    failureReason: received ? null : 'CARD_NOT_RECEIVED',
  });
  return { ok: changed, error: changed ? null : 'This order has already been decided.' };
}
