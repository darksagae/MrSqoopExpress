// Extension is explicit so plain `node` (scripts/db-init.mjs) can resolve this
// too — Next's bundler is happy either way.
import crypto from 'crypto';
import { getSql } from './db.js';
import { syncOrderToTracking } from './tracking.js';
import { sendOrderConfirmation, isEmailConfigured } from './email.js';

/**
 * Order persistence.
 *
 * Money moves against these rows, so two rules hold throughout:
 *
 *  - Payment state only ever advances PENDING -> SUCCESSFUL/FAILED, never back.
 *    Callback and poll race each other constantly; whichever lands second must
 *    not undo the first.
 *  - Marking an order paid is idempotent. A callback can be redelivered and the
 *    poll runs concurrently, so the update is guarded on current state and
 *    reports whether it was the transition that actually won.
 */

export async function initSchema() {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id               TEXT PRIMARY KEY,
      customer_name    TEXT        NOT NULL,
      customer_phone   TEXT        NOT NULL,
      network          TEXT        NOT NULL,
      amount_ugx       BIGINT      NOT NULL,
      items            JSONB       NOT NULL DEFAULT '[]'::jsonb,
      payment_status   TEXT        NOT NULL DEFAULT 'PENDING',
      order_status     TEXT        NOT NULL DEFAULT 'awaiting_payment',
      payment_ref      TEXT,
      failure_reason   TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      paid_at          TIMESTAMPTZ,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Looking an order up by provider reference is the hot path for both the
  // callback and the status poll.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_ref_idx ON orders (payment_ref) WHERE payment_ref IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (payment_status, created_at DESC)`;

  return true;
}

/**
 * Link orders to customer accounts. Added lazily (and idempotently) because the
 * live database predates it and schema scripts are run by hand. Memoised, and
 * never fatal: if it fails, orders are still taken, just without the account link.
 */
let accountColumns = null;
export function ensureAccountColumns() {
  if (!accountColumns) {
    accountColumns = (async () => {
      try {
        const sql = getSql();
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id TEXT`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ`;
        await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_ugx BIGINT NOT NULL DEFAULT 0`;
        await sql`CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC) WHERE user_id IS NOT NULL`;
        return true;
      } catch (e) {
        console.error('[orders] could not add account columns:', e.message);
        accountColumns = null; // try again next time
        return false;
      }
    })();
  }
  return accountColumns;
}

/**
 * Order numbers run MSE-001, MSE-002 ... in the order orders are started, from a
 * database sequence so two checkouts at the same instant can never share one.
 * A number is used up even if that checkout is abandoned, so the series can have
 * gaps but never repeats. (The number doubles as the payment reference, so it
 * must be unique for good.)
 *
 * If the sequence cannot be reached, fall back to a random id rather than stop
 * someone paying: an odd-looking number is better than a lost sale.
 */
export async function newOrderId() {
  try {
    const sql = getSql();
    await sql`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1`;
    const [{ n }] = await sql`SELECT nextval('order_number_seq') AS n`;
    return 'MSE-' + String(n).padStart(3, '0');
  } catch (e) {
    console.error('[orders] sequence unavailable, using a random order id:', e.message);
    return 'MSE-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
}

export async function createOrder({ orderId, customerName, customerPhone, network, amountUGX, items, paymentRef, userId, customerEmail, promoCode, discountUGX }) {
  const sql = getSql();
  if (await ensureAccountColumns()) {
    const linked = await sql`
      INSERT INTO orders (id, customer_name, customer_phone, network, amount_ugx, items, payment_ref, user_id, customer_email, promo_code, discount_ugx)
      VALUES (${orderId}, ${customerName}, ${customerPhone}, ${network}, ${amountUGX},
              ${JSON.stringify(items || [])}::jsonb, ${paymentRef || null}, ${userId || null}, ${customerEmail || null},
              ${promoCode || null}, ${discountUGX || 0})
      RETURNING *
    `;
    return linked[0];
  }
  const rows = await sql`
    INSERT INTO orders (id, customer_name, customer_phone, network, amount_ugx, items, payment_ref)
    VALUES (${orderId}, ${customerName}, ${customerPhone}, ${network}, ${amountUGX},
            ${JSON.stringify(items || [])}::jsonb, ${paymentRef || null})
    RETURNING *
  `;
  return rows[0];
}

/** Record the provider's reference once the payment request has been accepted. */
export async function attachPaymentRef(orderId, paymentRef) {
  const sql = getSql();
  const rows = await sql`
    UPDATE orders SET payment_ref = ${paymentRef}, updated_at = now()
     WHERE id = ${orderId} AND payment_ref IS NULL
    RETURNING *
  `;
  return rows[0] || null;
}

/** Close an order whose payment request never reached the customer. */
export async function failUnsentOrder(orderId, reason) {
  const sql = getSql();
  await sql`
    UPDATE orders
       SET payment_status = 'FAILED', order_status = 'cancelled',
           failure_reason = ${reason}, updated_at = now()
     WHERE id = ${orderId} AND payment_status = 'PENDING' AND payment_ref IS NULL
  `;
}

export async function getOrder(orderId) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
  return rows[0] || null;
}

export async function getOrderByRef(paymentRef) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM orders WHERE payment_ref = ${paymentRef}`;
  return rows[0] || null;
}

/**
 * Record a settled payment. Only applies to orders still PENDING, so a
 * redelivered callback or a slow poll can't overwrite a decided outcome.
 *
 * @returns {{ changed: boolean, order: object|null }} changed is true only when
 *          this call performed the transition.
 */
export async function settlePayment(paymentRef, status, { failureReason } = {}) {
  const sql = getSql();
  const paid = status === 'SUCCESSFUL';

  const rows = await sql`
    UPDATE orders
       SET payment_status = ${status},
           order_status   = ${paid ? 'awaiting_admin_confirmation' : 'cancelled'},
           paid_at        = ${paid ? new Date() : null},
           failure_reason = ${failureReason || null},
           updated_at     = now()
     WHERE payment_ref = ${paymentRef}
       AND payment_status = 'PENDING'
    RETURNING *
  `;

  if (rows.length) {
    const order = rows[0];
    // This is the single winning transition (guarded on PENDING above), so it's
    // the right place to hand a paid order to the tracking system — exactly once.
    // Best-effort: syncOrderToTracking never throws.
    if (paid) {
      const synced = await syncOrderToTracking(order);
      if (synced) await markSynced(order.id);
      else console.error('[settlePayment] tracking sync did not complete for', order.id);
      // The buyer's confirmation email, sent exactly once with this transition.
      // Best-effort: a mail hiccup must never undo a settled payment.
      if (order.customer_email && isEmailConfigured()) {
        await sendOrderConfirmation(order).catch((e) =>
          console.error('[settlePayment] confirmation email failed for', order.id, e.message)
        );
      }
    }
    return { changed: true, order };
  }

  // Either unknown reference, or already settled — distinguish for the caller.
  return { changed: false, order: await getOrderByRef(paymentRef) };
}

/**
 * Keep the network's own reason for a failed payment when the status poll got
 * there first and could only record a bare "FAILED". Never touches a paid order.
 */
export async function noteFailureReason(paymentRef, reason) {
  if (!reason) return;
  const sql = getSql();
  await sql`
    UPDATE orders SET failure_reason = ${reason}, updated_at = now()
     WHERE payment_ref = ${paymentRef}
       AND payment_status = 'FAILED'
       AND (failure_reason IS NULL OR failure_reason IN ('FAILED', 'REJECTED'))
  `;
}

/** Orders whose payment cleared and which an admin has not yet actioned. */
export async function listAwaitingAdmin() {
  const sql = getSql();
  return sql`
    SELECT * FROM orders
     WHERE payment_status = 'SUCCESSFUL'
       AND order_status = 'awaiting_admin_confirmation'
     ORDER BY paid_at DESC
  `;
}

/** Orders paid recently, for re-sending to the admin dashboard if a push was missed. */
export async function listRecentPaid({ sinceHours = 6, limit = 25 } = {}) {
  const sql = getSql();
  return sql`
    SELECT * FROM orders
     WHERE payment_status = 'SUCCESSFUL'
       AND paid_at > now() - make_interval(hours => ${sinceHours})
     ORDER BY paid_at DESC
     LIMIT ${limit}
  `;
}

/**
 * Orders stuck PENDING past a grace period. MTN fires its callback once and
 * never retries, so without a sweep over these an order whose callback was
 * dropped would sit unresolved forever.
 */
export async function listStalePending({ olderThanMinutes = 5, limit = 50, networks = ['mtn', 'airtel'] } = {}) {
  const sql = getSql();
  return sql`
    SELECT * FROM orders
     WHERE payment_status = 'PENDING'
       AND payment_ref IS NOT NULL
       AND network = ANY(${networks})
       AND created_at < now() - make_interval(mins => ${olderThanMinutes})
     ORDER BY created_at ASC
     LIMIT ${limit}
  `;
}

/** A signed-in customer's own orders, newest first. Unpaid attempts are left out. */
export async function listOrdersForUser(userId, { limit = 50 } = {}) {
  if (!userId || !(await ensureAccountColumns())) return [];
  const sql = getSql();
  return sql`
    SELECT * FROM orders
     WHERE user_id = ${userId}
       AND NOT (payment_status = 'PENDING' AND created_at < now() - interval '1 day')
     ORDER BY created_at DESC
     LIMIT ${limit}
  `;
}

/** Record that the admin has this order, so the retry sweep can skip it. */
export async function markSynced(orderId) {
  try {
    if (!(await ensureAccountColumns())) return;
    await getSql()`UPDATE orders SET synced_at = now() WHERE id = ${orderId}`;
  } catch (e) {
    console.error('[orders] could not mark synced', orderId, e.message);
  }
}

/**
 * Paid orders the admin has not confirmed receiving yet, oldest first. The
 * reconcile cron re-sends these until they land, so a failed push is never
 * the end of an order.
 */
export async function listUnsynced({ limit = 25 } = {}) {
  if (!(await ensureAccountColumns())) return [];
  return getSql()`
    SELECT * FROM orders
     WHERE payment_status = 'SUCCESSFUL' AND synced_at IS NULL
     ORDER BY paid_at ASC NULLS LAST
     LIMIT ${limit}
  `;
}
