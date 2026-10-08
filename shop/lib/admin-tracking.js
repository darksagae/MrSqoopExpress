/**
 * Live shipping stage from the tracking site (order.mrsqoopexpress.com).
 *
 * The shop knows about payment; the tracking site knows where the parcel is.
 * Best-effort and short-timeout: if it is unreachable the customer still sees
 * the shop's own status, never an error.
 */
const configured = (process.env.TRACKING_API_URL || '').replace(/\/$/, '');
const BASE = !configured || /^https?:\/\/(www\.)?mrsqoopexpress\.com$/i.test(configured)
  ? 'https://control.mrsqoopexpress.com'
  : configured;

const STAGES = [
  'Order Confirmed',
  'Order Processing',
  'Package Shipped to International Address',
  'Package Received at International Address',
  'Package in Transit to Uganda',
  'Customs Clearance Started',
  'Customs Clearance Complete',
  'Package Arrived at Kampala Office',
  'Package Ready for Pick Up',
  'Order Delivered',
];

export async function fetchShippingStage(orderId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/api/orders/track?q=${encodeURIComponent(orderId)}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { order } = await res.json();
    // The tracking site also matches by phone; only trust an exact id match.
    if (!order || String(order.trackingId).toLowerCase() !== String(orderId).toLowerCase()) return null;
    const index = Number(order.currentStageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) return null;
    const when = new Map((order.statusHistory || []).map((h) => [h.stageIndex, h.timestamp]));
    return {
      index,
      label: STAGES[index],
      expectedDelivery: order.expectedDelivery || null,
      steps: STAGES.map((label, i) => ({ key: `s${i}`, label, done: i <= index, at: when.get(i) || null })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
