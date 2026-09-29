// Extension is explicit so plain `node` (scripts/db-init.mjs) can resolve this
// too — Next's bundler is happy either way.
import crypto from 'crypto';
import { getSql } from './db.js';
import { syncOrderToTracking } from './tracking.js';

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

/** Time-ordered but collision-proof when two checkouts land in the same ms. */
export function newOrderId() {
  return 'MSE-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function createOrder({ orderId, customerName, customerPhone, network, amountUGX, items, paymentRef }) {
  const sql = getSql();
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
      if (!synced) console.error('[settlePayment] tracking sync did not complete for', order.id);
    }
    return { changed: true, order };
  }

  // Either unknown reference, or already settled — distinguish for the caller.
  return { changed: false, order: await getOrderByRef(paymentRef) };
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
