import { NextResponse } from 'next/server';
import { networkStatus } from '@/lib/payments/resolve';
import { startMobileMoneyOrder } from '@/lib/checkout';
import { signedInUser } from '@/lib/session';

/**
 * POST /api/orders
 * Body: { customer: {name, phone}, network: 'mtn'|'airtel', items: [...], total }
 *
 * Initiates a mobile-money charge (MTN request-to-pay / Airtel USSD push); see
 * lib/checkout.js. A 2xx here means the provider accepted the request, not
 * that it was paid — the customer still has to approve the prompt on their
 * handset. The order stays PENDING until the provider says otherwise.
 */
export async function GET() {
  // Lightweight status probe so the checkout page can show which networks are live.
  return NextResponse.json({ networks: networkStatus() });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Checkout needs an account. Enforced here, not just in the page.
  const account = await signedInUser();
  if (!account) {
    return NextResponse.json({ error: 'Please log in to place your order.', code: 'LOGIN_REQUIRED' }, { status: 401 });
  }

  const { customer, network, items, total, promoCode } = body;
  const result = await startMobileMoneyOrder({ account, customer, network, items, total, promoCode });
  return NextResponse.json(result.body, { status: result.status });
}
