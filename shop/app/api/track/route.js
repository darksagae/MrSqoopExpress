import { NextResponse } from 'next/server';
import { getOrder } from '@/lib/orders';

/**
 * GET /api/track?orderId=MSE-XXX&phone=07...
 *
 * Customer-facing order lookup. Requires the phone number used at checkout so
 * an order id alone can't be used to read someone else's order.
 */
const digits = (s) => String(s || '').replace(/[^0-9]/g, '');
const last9 = (s) => digits(s).slice(-9);

// Customer-facing stages derived from the internal order/payment state.
function toTimeline(order) {
  const paid = order.payment_status === 'SUCCESSFUL';
  const cancelled = order.payment_status === 'FAILED' || order.order_status === 'cancelled';
  const confirmed = paid && order.order_status !== 'awaiting_payment';

  // Once payment clears the customer sees "Confirmed" (backend may still be
  // awaiting admin forwarding — that distinction stays internal).
  const steps = [
    { key: 'placed', label: 'Order placed', done: true, at: order.created_at },
    { key: 'paid', label: 'Payment received', done: paid, at: order.paid_at },
    { key: 'confirmed', label: 'Confirmed — preparing your order', done: confirmed, at: order.paid_at },
    { key: 'shipped', label: 'On the way', done: false, at: null },
    { key: 'delivered', label: 'Delivered', done: false, at: null },
  ];

  let statusLabel = 'Awaiting payment';
  if (cancelled) statusLabel = 'Payment not completed';
  else if (confirmed) statusLabel = 'Confirmed';
  else if (paid) statusLabel = 'Paid';

  return { statusLabel, cancelled, steps };
}

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
