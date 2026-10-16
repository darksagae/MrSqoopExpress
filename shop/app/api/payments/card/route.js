import { NextResponse } from 'next/server';
import { buildPaymentRequest, isCardConfigured, cardMissing } from '@/lib/payments/card';
import { createOrder, newOrderId } from '@/lib/orders';
import { confirmCartTotal } from '@/lib/pricing';
import { signedInUser } from '@/lib/session';
import { trackingFrom } from '@/lib/meta-capi';
import { CARD_LINK_PREFIX, cardPayLink } from '@/lib/payments/card-link';

/**
 * POST /api/payments/card
 * Body: { customer: {name, phone}, items: [...], total }
 *
 * Records a PENDING card order and returns the signed fields the browser posts
 * to the hosted card page. Nothing is charged here; the outcome arrives later
 * at /checkout/card/return.
 *
 * Until the Secure Acceptance keys are set, Absa's payment link is used
 * instead when one is saved in the admin: the reply is { mode: 'link' } with
 * the exact amount to pay, and the admin confirms the payment by hand (see
 * lib/payments/card-link.js).
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

  const secure = isCardConfigured();
  const payLink = secure ? '' : await cardPayLink();
  if (!secure && !payLink) {
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

  const orderId = await newOrderId();
  const { endpoint, fields, transactionUuid } = secure
    ? buildPaymentRequest({ orderId, amountUGX })
    : { endpoint: null, fields: null, transactionUuid: `${CARD_LINK_PREFIX}${orderId}` };

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
      // For matching the sale to a Meta ad (lib/meta-capi.js).
      tracking: trackingFrom(request),
    });
  } catch (dbError) {
    // Never send the customer to pay for an order we have no record of.
    console.error('[CARD ORDER NOT PERSISTED]', orderId, dbError.message);
    return NextResponse.json(
      { error: 'Could not start your card payment. Please try again.' },
      { status: 500 }
    );
  }

  if (!secure) {
    return NextResponse.json({
      mode: 'link',
      orderId,
      network: 'card',
      reference: transactionUuid,
      amountUGX,
      payLink,
    });
  }
  return NextResponse.json({ orderId, endpoint, fields });
}
