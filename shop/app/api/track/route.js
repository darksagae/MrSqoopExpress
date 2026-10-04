import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/orders';
import { toTimeline } from '@/lib/timeline';

/**
 * GET /api/track?orderId=MSE-XXX&phone=07...
 *
 * Customer-facing order lookup. Requires the phone number used at checkout so
 * an order id alone can't be used to read someone else's order.
 */
const digits = (s) => String(s || '').replace(/[^0-9]/g, '');
const last9 = (s) => digits(s).slice(-9);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const orderId = (searchParams.get('orderId') || '').trim();
  const phone = searchParams.get('phone') || '';

  if (!orderId || !phone) {
    return NextResponse.json({ error: 'Order number and phone number are required.' }, { status: 400 });
  }

  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    console.error('Track lookup failed:', e.message);
    return NextResponse.json({ error: 'Could not look up that order right now.' }, { status: 502 });
  }

  // Same response for "no such order" and "wrong phone" so ids can't be probed.
  if (!order || last9(order.customer_phone) !== last9(phone)) {
    return NextResponse.json({ error: 'No order found with that number and phone.' }, { status: 404 });
  }

  const { statusLabel, cancelled, steps } = toTimeline(order);
  return NextResponse.json({
    order: {
      id: order.id,
      statusLabel,
      cancelled,
      amountUGX: Number(order.amount_ugx),
      network: order.network,
      items: order.items || [],
      placedAt: order.created_at,
      steps,
    },
  });
}
