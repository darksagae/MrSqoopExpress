import { NextResponse } from 'next/server';
import { resolveProvider, networkStatus, NETWORKS } from '@/lib/payments/resolve';
import { createOrder, newOrderId, attachPaymentRef, failUnsentOrder } from '@/lib/orders';
import { confirmCartTotal } from '@/lib/pricing';
import { signedInUser } from '@/lib/session';
import { detectNetwork } from '@/lib/payments/networks';

/**
 * POST /api/orders
 * Body: { customer: {name, phone}, network: 'mtn'|'airtel', items: [...], total }
 *
 * Initiates a mobile-money charge (MTN request-to-pay / Airtel USSD push).
 * A 2xx here means the provider accepted the request, not that it was paid —
 * the customer still has to approve the prompt on their handset. The order
 * stays PENDING until the provider says otherwise. The total sent by the
 * browser is only checked against our own re-pricing, never charged as-is.
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

  const { customer = {}, network, items = [], total } = body;

  // Validate.
  if (!customer.name || !customer.phone) {
    return NextResponse.json({ error: 'Your name and mobile-money phone number are required.' }, { status: 400 });
  }
  if (!NETWORKS.includes(network)) {
    return NextResponse.json({ error: 'Choose a payment method: MTN Mobile Money or Airtel Money.' }, { status: 400 });
  }
  if (!items.length || !Number(total)) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
  }

  // A prompt sent to the wrong network never arrives, and the customer is left
  // waiting on a PIN request that will never come. Catch it before charging.
  const actual = detectNetwork(customer.phone);
  if (actual && actual !== network) {
    const name = actual === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money';
    return NextResponse.json(
      { error: `${customer.phone} is ${actual === 'mtn' ? 'an MTN' : 'an Airtel'} number. Please choose ${name}.`, code: 'NETWORK_MISMATCH', network: actual },
      { status: 400 }
    );
  }

  const { provider, ready, missing, label } = resolveProvider(network);

  // Not connected yet — be honest, don't fake a charge.
  if (!ready) {
    // The variable names identify our payment processor, so they stay in the
    // logs rather than going back to the browser.
    console.error(`[PAYMENTS] ${network} not configured. Missing: ${missing.join(', ')}`);
    return NextResponse.json(
      { error: `${label} is not available right now. Please try the other option or check back shortly.` },
      { status: 503 }
    );
  }

  // The amount charged is always our own re-priced total, never the browser's.
  const priced = await confirmCartTotal(items, total);
  if (priced.response) return NextResponse.json(priced.response.body, { status: priced.response.status });
  const { lines, total: amountUGX } = priced;

  // Signed in? Tie the order to the account. Guests can still check out.
  const account = await signedInUser();

  const orderId = newOrderId();

  // Record the order before any prompt reaches the customer's phone, so a
  // database fault can never leave someone paying for an order we don't have.
  try {
    await createOrder({
      orderId,
      customerName: customer.name,
      customerPhone: customer.phone,
      network,
      amountUGX,
      items: lines,
      userId: account?.id,
      customerEmail: account?.email,
      paymentRef: null,
    });
  } catch (dbError) {
    console.error('[ORDER NOT PERSISTED]', orderId, dbError.message);
    return NextResponse.json(
      { error: 'We could not start your order. Nothing has been charged — please try again.' },
      { status: 500 }
    );
  }

  let reference;
  try {
    const result = await provider.requestToPay({
      amountUGX,
      phone: customer.phone,
      orderId,
      note: `MrSqoopExpress ${orderId}`,
      // Only the aggregated provider needs this — the direct ones already know
      // which network they are.
      network,
    });
    reference = result.referenceId || result.transactionId;
  } catch (error) {
    // error.code names the processor (LIPAPAY_*). Keep it server-side; the
    // customer gets a generic code they could quote to support.
    console.error('Payment initiation failed:', orderId, error.code, error.message);
    await failUnsentOrder(orderId, `REQUEST_FAILED ${error.code || ''}`.trim()).catch((e) =>
      console.error('Could not close unsent order', orderId, e.message)
    );
    return NextResponse.json(
      { error: 'Could not start the mobile-money payment. Please try again.', code: 'PAYMENT_ERROR' },
      { status: 502 }
    );
  }

  try {
    await attachPaymentRef(orderId, reference);
  } catch (dbError) {
    // The prompt is already on the customer's phone. Log everything needed to
    // reconcile by hand and warn them off approving it.
    console.error('[PAYMENT REF NOT PERSISTED]', orderId, network, reference, dbError.message);
    return NextResponse.json(
      {
        error:
          'Your payment was requested but we could not record it. ' +
          'Do not approve the prompt — contact support with this reference.',
        orderId,
        reference,
      },
      { status: 500 }
    );
  }

  // The provider has only *accepted* the request at this point — the customer
  // has not entered their PIN yet. Stay pending; the checkout page polls
  // /api/orders/status until the provider resolves it.
  return NextResponse.json({
    success: true,
    orderId,
    status: 'pending',
    network,
    reference,
    amountUGX,
    message: `Approve the payment prompt on your phone (${customer.phone}) to complete your order.`,
  });
}
