import { NextResponse } from 'next/server';
import { signedInUser } from '@/lib/session';
import { listOrdersForUser } from '@/lib/orders';
import { toTimeline } from '@/lib/timeline';

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

  return NextResponse.json({
    orders: rows.map((o) => {
      const { statusLabel, cancelled, steps } = toTimeline(o);
      return {
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
