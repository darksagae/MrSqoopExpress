import { NextResponse } from 'next/server';
import { listStalePending, listRecentPaid, settlePayment } from '@/lib/orders';
import { syncOrderToTracking, isTrackingConfigured } from '@/lib/tracking';
import { resolveProvider, NETWORKS } from '@/lib/payments/resolve';

/**
 * GET /api/cron/reconcile-payments
 *
 * Asks the mobile-money provider for the real outcome of orders still
 * PENDING after a few minutes. MTN sends its callback once with no retry and
 * Airtel has no callback wired at all, so without this an order paid by a
 * shopper who closed checkout early would stay pending forever.
 *
 * Card orders are skipped for the payment check: their outcome arrives on the
 * signed notify URL. It also re-sends recently paid orders to the admin
 * dashboard in case the original push failed.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stale = await listStalePending({ olderThanMinutes: 5, limit: 50, networks: NETWORKS });
  const results = [];

  for (const order of stale) {
    if (!NETWORKS.includes(order.network)) continue;
    const { provider, ready } = resolveProvider(order.network);
    if (!ready) continue;

    try {
      const status = String((await provider.getPaymentStatus(order.payment_ref)) || '').toUpperCase();
      if (status === 'SUCCESSFUL' || status === 'FAILED' || status === 'REJECTED') {
        const { changed } = await settlePayment(
          order.payment_ref,
          status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILED',
          { failureReason: status === 'SUCCESSFUL' ? null : status }
        );
        results.push({ orderId: order.id, status, changed });
      }
    } catch (e) {
      console.error('[RECONCILE] status check failed', order.id, e.code, e.message);
    }
  }

  // syncOrderToTracking only fires once, when an order first turns paid. If
  // that single attempt failed (admin down, network blip) the order would never
  // reach the dashboard, so recent paid orders are re-sent here. The admin
  // treats a repeated order number as success, which makes this harmless.
  let resync = null;
  if (isTrackingConfigured()) {
    const paid = await listRecentPaid({ sinceHours: 6, limit: 25 });
    const outcomes = await Promise.all(paid.map((o) => syncOrderToTracking(o)));
    resync = { checked: paid.length, failed: outcomes.filter((ok) => !ok).length };
    if (resync.failed) console.error('[RECONCILE] admin sync still failing for', resync.failed, 'order(s)');
  }

  return NextResponse.json({ checked: stale.length, settled: results, adminSync: resync });
}
