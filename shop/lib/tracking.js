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
