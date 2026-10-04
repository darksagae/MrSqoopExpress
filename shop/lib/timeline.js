/** Customer-facing stages derived from the internal order/payment state. */
export function toTimeline(order) {
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
