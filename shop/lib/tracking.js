/**
 * Push a paid order into the mrsqoopexpress.com tracking/admin system.
 *
 * The storefront and the tracking site use separate databases, so when payment
 * settles we hand the order to the tracking site's ingest endpoint. The
 * shop's order id becomes the customer-facing tracking number.
 *
 * Env:
 *   TRACKING_API_URL     — base URL of the tracking site (default mrsqoopexpress.com)
 *   ORDER_INGEST_SECRET  — shared secret matching the ingest endpoint
 */

const BASE = process.env.TRACKING_API_URL || 'https://mrsqoopexpress.com';
const SECRET = process.env.ORDER_INGEST_SECRET;

export function isTrackingConfigured() {
  return Boolean(SECRET);
}

const num = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

/**
 * What the operator needs to fulfil the order: one entry per line with the
 * supplier product and SKU to buy. Older orders saved before shipping and
 * handling were stored per line simply report zero for those.
 */
export function buildIngestItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list.slice(0, 50).map((i) => ({
    productId: String(i.id ?? '').split(':')[0].slice(0, 40),
    skuId: i.skuId ? String(i.skuId).slice(0, 40) : null,
    name: String(i.name ?? 'Item').slice(0, 200),
    qty: Math.max(1, num(i.qty)),
    unitUgx: num(i.price),
    shipUgx: num(i.shipUGX),
    handlingUgx: num(i.handlingUGX),
  }));
}

/**
 * Best-effort sync. Never throws — a tracking-sync failure must not roll back a
 * settled payment. Returns true on success so callers can log the outcome.
 * @param {{id:string, customer_name:string, customer_phone:string, amount_ugx:number|string}} order
 */
export async function syncOrderToTracking(order) {
  if (!SECRET) {
    console.warn('[tracking] ORDER_INGEST_SECRET not set — skipping sync for', order?.id);
    return false;
  }
  if (!order?.id) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/api/orders/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': SECRET },
      body: JSON.stringify({
        trackingId: order.id,
        customerName: order.customer_name,
        phone: order.customer_phone,
        billingUgx: Number(order.amount_ugx) || 0,
        websiteShippedFrom: 'AliExpress',
        // Payment and item details for the operator's dashboard. The admin
        // ignores fields it doesn't know, so this is safe to send to an older
        // deployment.
        paymentMethod: order.network || null,
        paymentRef: order.payment_ref || null,
        paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null,
        items: buildIngestItems(order.items),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[tracking] ingest failed (${res.status}) for ${order.id}: ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[tracking] ingest error for ${order.id}:`, e.message);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
