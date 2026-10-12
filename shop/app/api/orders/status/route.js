import { NextResponse } from 'next/server';
import { checkPaymentStatus } from '@/lib/checkout';
import { getOrderByRef } from '@/lib/orders';
import { explainFailure } from '@/lib/payments/failure';
import { signedInUser } from '@/lib/session';

/**
 * GET /api/orders/status?network=mtn|airtel&reference=<id>
 *
 * Authoritative payment outcome, read straight from the provider and written
 * down once settled (see lib/checkout.js): provider callbacks can't be relied
 * on, so the checkout page polls this.
 *
 * When a payment failed, the customer who placed the order also gets the
 * network's reason in plain words ("balance too low", "no approval in time").
 * Order references are guessable, so nobody else does.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = await checkPaymentStatus(searchParams.get('network'), searchParams.get('reference'));

  if (result.status === 200 && result.body.settled && !result.body.paid) {
    const [order, user] = await Promise.all([
      getOrderByRef(result.body.reference).catch(() => null),
      signedInUser(),
    ]);
    if (order && user && order.user_id === user.id) {
      result.body.reason = explainFailure(order.network, order.failure_reason);
    }
  }
  return NextResponse.json(result.body, { status: result.status });
}
