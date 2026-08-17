import { NextResponse } from 'next/server';
import * as mtn from '@/lib/payments/mtn';
import * as airtel from '@/lib/payments/airtel';
import { createOrder } from '@/lib/orders';

/**
 * POST /api/orders
 * Body: { customer: {name, phone}, network: 'mtn'|'airtel', items: [...], total }
 *
 * Initiates a mobile-money charge (MTN request-to-pay / Airtel USSD push).
 * A 2xx here means the provider accepted the request, not that it was paid —
 * the customer still has to approve the prompt on their handset. The order
 * stays PENDING until the provider says otherwise. (DB persistence is a
 * follow-up; for now the pending order is logged server-side.)
 */
export async function GET() {
  // Lightweight status probe so the checkout page can show which networks are live.
  return NextResponse.json({
    networks: {
      mtn: { ready: mtn.isMtnConfigured(), missing: mtn.mtnMissing() },
      airtel: { ready: airtel.isAirtelConfigured(), missing: airtel.airtelMissing() },
    },
  });
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
  if (!['mtn', 'airtel'].includes(network)) {
    return NextResponse.json({ error: 'Choose a payment method: MTN Mobile Money or Airtel Money.' }, { status: 400 });
  }
  if (!items.length || !Number(total)) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 });
  }

  const orderId = 'MSE-' + Date.now().toString(36).toUpperCase();
  const provider = network === 'mtn' ? mtn : airtel;
  const isReady = network === 'mtn' ? mtn.isMtnConfigured() : airtel.isAirtelConfigured();
  const missing = network === 'mtn' ? mtn.mtnMissing() : airtel.airtelMissing();

  // Not connected yet — be honest, don't fake a charge.
  if (!isReady) {
    return NextResponse.json(
      {
        error: `${network === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money'} is not connected yet.`,
        missing,
        hint: 'Add the merchant API credentials to the environment to enable live payment.',
      },
      { status: 503 }
    );
  }

  try {
    const result = await provider.requestToPay({
      amountUGX: Math.round(Number(total)),
      phone: customer.phone,
      orderId,
      note: `MrSqoopExpress ${orderId}`,
    });

    const reference = result.referenceId || result.transactionId;

    // Persist before returning. If this throws the customer has already been
    // charged-in-progress, so surface it loudly rather than returning a success
    // for an order that exists nowhere.
    try {
      await createOrder({
        orderId,
        customerName: customer.name,
        customerPhone: customer.phone,
        network,
        amountUGX: Math.round(Number(total)),
        items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
        paymentRef: reference,
      });
    } catch (dbError) {
      console.error('[ORDER NOT PERSISTED]', orderId, reference, dbError.message);
      return NextResponse.json(
        {
          error:
            'Your payment was requested but we could not record the order. ' +
            'Do not approve the prompt — contact support with this reference.',
          orderId,
          reference,
        },
        { status: 500 }
      );
    }

    // The provider has only *accepted* the request at this point — the customer
    // has not entered their PIN yet. Reporting 'confirmed' here would tell them
    // the order is paid before any money has moved. Stay pending; the checkout
    // page polls /api/orders/status until the provider resolves it.
    return NextResponse.json({
      success: true,
      orderId,
      status: 'pending',
      network,
      reference: result.referenceId || result.transactionId,
      message: `Approve the payment prompt on your phone (${customer.phone}) to complete your order.`,
    });
  } catch (error) {
    console.error('Payment initiation failed:', error);
    return NextResponse.json(
      { error: 'Could not start the mobile-money payment. Please try again.', code: error.code || 'PAYMENT_ERROR' },
      { status: 502 }
    );
  }
}
