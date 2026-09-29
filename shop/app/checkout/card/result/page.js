'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../../../cart';
import { CUSTOMER_DESTINATION_LABEL } from '@/lib/shipping-destination';

const COPY = {
  paid: {
    icon: '✓',
    title: 'Payment Received',
    body: 'Your card payment is confirmed and your order is being prepared.',
    muted: `Delivering to ${CUSTOMER_DESTINATION_LABEL}.`,
  },
  review: {
    icon: '⏳',
    title: 'Payment Under Review',
    body: 'Your bank is reviewing this payment. We’ll email you as soon as it clears.',
    muted: 'Please don’t pay again for this order.',
  },
  failed: {
    icon: '×',
    title: 'Payment Not Completed',
    body: 'The card payment didn’t go through, so your order hasn’t been placed.',
    muted: 'Your items are still in your cart. You can try again or pay with mobile money.',
  },
  error: {
    icon: '×',
    title: 'We Couldn’t Confirm Your Payment',
    body: 'Something went wrong confirming this payment.',
    muted: 'If your card was charged, contact support with your order number. Don’t pay twice.',
  },
};

function Result() {
  const params = useSearchParams();
  const outcome = COPY[params.get('outcome')] ? params.get('outcome') : 'error';
  const orderId = params.get('order');
  const { items, clear } = useCart();
  const c = COPY[outcome];

  // Wait for the cart to load from storage before clearing, or the load
  // would restore the items straight after.
  useEffect(() => {
    if (outcome === 'paid' && items.length) clear();
  }, [outcome, items.length, clear]);

  return (
    <div className="co-done">
      <div className={`co-done-check${outcome === 'paid' ? '' : ' is-muted'}`}>{c.icon}</div>
      <h1>{c.title}</h1>
      {orderId && <p className="co-order-id">Order {orderId}</p>}
      <p>{c.body}</p>
      <p className="co-muted">{c.muted}</p>
      <div className="co-done-actions">
        {outcome === 'failed' ? (
          <Link href="/checkout" className="btn-dark co-continue">Try again</Link>
        ) : (
          orderId && outcome !== 'error' && (
            <a
              href={`https://mrsqoopexpress.com/?order=${encodeURIComponent(orderId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-dark co-continue"
            >
              Track your order
            </a>
          )
        )}
        <Link href="/#shop" className="co-continue co-continue-alt">Continue Shopping</Link>
      </div>
    </div>
  );
}

export default function CardResultPage() {
  return (
    <Suspense fallback={<div className="co-done"><p className="co-muted">Loading…</p></div>}>
      <Result />
    </Suspense>
  );
}
