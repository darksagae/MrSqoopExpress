import { NextResponse } from 'next/server';
import { signedInUser } from '@/lib/session';
import { listOrdersForUser } from '@/lib/orders';
import { toTimeline } from '@/lib/timeline';
import { fetchShippingStage } from '@/lib/admin-tracking';

/** GET /api/account/orders — the signed-in customer's own orders. */
export async function GET() {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });

  let rows;
  try {
    rows = await listOrdersForUser(user.id);
  } catch (e) {
    console.error('Account orders failed:', e.message);
    return NextResponse.json({ error: 'Could not load your orders right now.' }, { status: 502 });
  }

  // Where each paid parcel is right now, from the tracking site.
  const stages = await Promise.all(
    rows.map((o) => (o.payment_status === 'SUCCESSFUL' ? fetchShippingStage(o.id) : null))
  );

  return NextResponse.json({
    orders: rows.map((o, n) => {
      const base = toTimeline(o);
      // Once the operator has moved it past "confirmed", show the real journey.
      const ship = stages[n] && stages[n].index >= 1 ? stages[n] : null;
      const statusLabel = ship ? ship.label : base.statusLabel;
      const steps = ship ? ship.steps : base.steps;
      const cancelled = base.cancelled;
      return {
        expectedDelivery: ship?.expectedDelivery || null,
        id: o.id,
        statusLabel,
        cancelled,
        amountUGX: Number(o.amount_ugx),
        items: (o.items || []).map((i) => ({ name: i.name, qty: i.qty, img: i.img || null })),
        placedAt: o.created_at,
        steps,
      };
    }),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
