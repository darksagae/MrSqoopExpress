import { NextResponse } from 'next/server';
import { buildPaymentRequest, isCardConfigured, cardMissing } from '@/lib/payments/card';
import { createOrder, newOrderId } from '@/lib/orders';
import { confirmCartTotal } from '@/lib/pricing';
import { signedInUser } from '@/lib/session';

/**
 * POST /api/payments/card
 * Body: { customer: {name, phone}, items: [...], total }
 *
 * Records a PENDING card order and returns the signed fields the browser posts
 * to the hosted card page. Nothing is charged here; the outcome arrives later
 * at /checkout/card/return.
 */
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

  const { customer = {}, items = [], total, promoCode } = body;

  if (!customer.name || !customer.phone) {
    return NextResponse.json({ error: 'Your name and phone number are required.' }, { status: 400 });
  }
  if (!items.length || !Number(total)) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
  }

  if (!isCardConfigured()) {
    console.error(`[PAYMENTS] card not configured. Missing: ${cardMissing().join(', ')}`);
    return NextResponse.json(
      { error: 'Card payments are not available right now. Please pay with mobile money.' },
      { status: 503 }
    );
  }

  // Charge our own re-priced total, never the browser's.
  const priced = await confirmCartTotal(items, total, { promoCode });
  if (priced.response) return NextResponse.json(priced.response.body, { status: priced.response.status });
  const { lines, total: amountUGX, promo } = priced;

  const orderId = newOrderId();
  const { endpoint, fields, transactionUuid } = buildPaymentRequest({ orderId, amountUGX });

  try {
    await createOrder({
      orderId,
      customerName: customer.name,
      customerPhone: customer.phone,
      network: 'card',
      amountUGX,
      items: lines,
      userId: account?.id,
      customerEmail: account?.email,
      promoCode: promo?.code,
      discountUGX: promo?.discountUGX,
      paymentRef: transactionUuid,
    });
  } catch (dbError) {
    // Never send the customer to pay for an order we have no record of.
    console.error('[CARD ORDER NOT PERSISTED]', orderId, dbError.message);
    return NextResponse.json(
      { error: 'Could not start your card payment. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ orderId, endpoint, fields });
}
