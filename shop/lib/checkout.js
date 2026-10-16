import { resolveProvider, NETWORKS } from '@/lib/payments/resolve';
import { createOrder, newOrderId, attachPaymentRef, failUnsentOrder, getOrderByRef, settlePayment } from '@/lib/orders';
import { TEST_REF_PREFIX, isTestCheckout, isTestRef } from '@/lib/test-checkout';
import { isCardLinkRef } from '@/lib/payments/card-link';
import { confirmCartTotal } from '@/lib/pricing';
import { detectNetwork } from '@/lib/payments/networks';

/**
 * The mobile-money checkout, shared by the checkout page (POST /api/orders) and
 * Sqoop Assist, so an order placed by voice is priced, recorded and charged
 * exactly like one placed on the website.
 *
 * Initiates a mobile-money charge (MTN request-to-pay / Airtel USSD push).
 * Success means the provider accepted the request, not that it was paid: the
 * customer still has to approve the prompt on their handset with their PIN.
 * The order stays PENDING until the provider says otherwise. The total passed
 * in is only checked against our own re-pricing, never charged as-is.
 *
 * @param {{ account: {id, email}, customer: {name, phone}, network: string,
 *           items: object[], total: number, promoCode?: string,
 *           tracking?: object }} input  tracking: see lib/meta-capi.js trackingFrom
 * @returns {Promise<{ status: number, body: object }>} the JSON reply
 */
export async function startMobileMoneyOrder({ account, customer = {}, network, items = [], total, promoCode, tracking }) {
  // Validate.
  if (!customer.name || !customer.phone) {
    return { status: 400, body: { error: 'Your name and mobile-money phone number are required.' } };
  }
  if (!NETWORKS.includes(network)) {
    return { status: 400, body: { error: 'Choose a payment method: MTN Mobile Money or Airtel Money.' } };
  }
  if (!items.length || !Number(total)) {
    return { status: 400, body: { error: 'Your cart is empty.' } };
  }

  // A prompt sent to the wrong network never arrives, and the customer is left
  // waiting on a PIN request that will never come. Catch it before charging.
  const actual = detectNetwork(customer.phone);
  if (actual && actual !== network) {
    const name = actual === 'mtn' ? 'MTN Mobile Money' : 'Airtel Money';
    return {
      status: 400,
      body: {
        error: `${customer.phone} is ${actual === 'mtn' ? 'an MTN' : 'an Airtel'} number. Please choose ${name}.`,
        code: 'NETWORK_MISMATCH',
        network: actual,
      },
    };
  }

  const { provider, ready, missing, label } = resolveProvider(network);
  const test = isTestCheckout(account);

  // Not connected yet — be honest, don't fake a charge.
  if (!ready && !test) {
    // The variable names identify our payment processor, so they stay in the
    // logs rather than going back to the browser.
    console.error(`[PAYMENTS] ${network} not configured. Missing: ${missing.join(', ')}`);
    return {
      status: 503,
      body: { error: `${label} is not available right now. Please try the other option or check back shortly.` },
    };
  }

  // The amount charged is always our own re-priced total, never the browser's.
  const priced = await confirmCartTotal(items, total, { promoCode });
  if (priced.response) return { status: priced.response.status, body: priced.response.body };
  const { lines, total: amountUGX, promo } = priced;

  const orderId = await newOrderId();

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
      promoCode: promo?.code,
      discountUGX: promo?.discountUGX,
      paymentRef: null,
      // For matching the sale to a Meta ad (lib/meta-capi.js).
      tracking,
    });
  } catch (dbError) {
    console.error('[ORDER NOT PERSISTED]', orderId, dbError.message);
    return { status: 500, body: { error: 'We could not start your order. Nothing has been charged — please try again.' } };
  }

  // Test checkout (lib/test-checkout.js): no payment request at all. The order
  // is marked paid under a TEST- reference and goes to the admin like any other.
  if (test) {
    const reference = `${TEST_REF_PREFIX}${orderId}`;
    try {
      await attachPaymentRef(orderId, reference);
      await settlePayment(reference, 'SUCCESSFUL');
    } catch (dbError) {
      console.error('[TEST ORDER NOT SETTLED]', orderId, dbError.message);
      return { status: 500, body: { error: 'We could not record the test order. Please try again.' } };
    }
    console.log('[TEST CHECKOUT] order recorded as paid without payment:', orderId, account?.email);
    return {
      status: 200,
      body: {
        success: true,
        orderId,
        status: 'pending',
        network,
        reference,
        amountUGX,
        test: true,
        message: 'Test order: no payment was taken.',
      },
    };
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
    return { status: 502, body: { error: 'Could not start the mobile-money payment. Please try again.', code: 'PAYMENT_ERROR' } };
  }

  try {
    await attachPaymentRef(orderId, reference);
  } catch (dbError) {
    // The prompt is already on the customer's phone. Log everything needed to
    // reconcile by hand and warn them off approving it.
    console.error('[PAYMENT REF NOT PERSISTED]', orderId, network, reference, dbError.message);
    return {
      status: 500,
      body: {
        error:
          'Your payment was requested but we could not record it. ' +
          'Do not approve the prompt — contact support with this reference.',
        orderId,
        reference,
      },
    };
  }

  // The provider has only *accepted* the request at this point — the customer
  // has not entered their PIN yet. Stay pending; the caller polls
  // checkPaymentStatus until the provider resolves it.
  return {
    status: 200,
    body: {
      success: true,
      orderId,
      status: 'pending',
      network,
      reference,
      amountUGX,
      message: `Approve the payment prompt on your phone (${customer.phone}) to complete your order.`,
    },
  };
}

/**
 * Authoritative payment outcome, read straight from the provider, and written
 * down when it has settled.
 *
 * Provider callbacks cannot be relied on: MTN sends theirs exactly once with no
 * retry, so a single dropped request would otherwise strand the order as
 * pending forever. Polling here closes that hole, and doubles as the
 * verification step for the unsigned callback.
 *
 * @returns {Promise<{ status: number, body: object }>} the JSON reply
 */
export async function checkPaymentStatus(network, reference) {
  // A card payment through Absa's link is decided by the admin, so its outcome
  // is our own record (lib/payments/card-link.js).
  if (network === 'card' && isCardLinkRef(reference)) {
    const order = await getOrderByRef(reference).catch(() => null);
    const status = order?.payment_status || 'PENDING';
    const settled = status === 'SUCCESSFUL' || status === 'FAILED';
    return { status: 200, body: { reference, network, status, settled, paid: status === 'SUCCESSFUL' } };
  }
  if (!NETWORKS.includes(network)) {
    return { status: 400, body: { error: 'network must be mtn or airtel' } };
  }
  if (!reference) {
    return { status: 400, body: { error: 'reference is required' } };
  }

  // A test order is never sent to the provider; its outcome is our own record,
  // and only test checkout can create a row with a TEST- reference.
  if (isTestRef(reference)) {
    const order = await getOrderByRef(reference).catch(() => null);
    const paid = order?.payment_status === 'SUCCESSFUL';
    return { status: 200, body: { reference, network, status: paid ? 'SUCCESSFUL' : 'PENDING', settled: paid, paid, test: true } };
  }

  const { provider, ready, label } = resolveProvider(network);
  if (!ready) {
    return { status: 503, body: { error: `${label} is not connected yet.` } };
  }

  try {
    const raw = await provider.getPaymentStatus(reference);
    const status = String(raw || 'UNKNOWN').toUpperCase();
    const settled = status === 'SUCCESSFUL' || status === 'FAILED' || status === 'REJECTED';

    // Write the outcome down. This is the path that saves us when a callback is
    // dropped — MTN sends it once and never retries, so without persisting here
    // the order would stay PENDING even though we just learned it settled.
    if (settled) {
      try {
        await settlePayment(reference, status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILED', {
          failureReason: status === 'SUCCESSFUL' ? null : status,
        });
      } catch (dbError) {
        // Reporting the true status still beats failing the request outright.
        console.error('Could not persist settled status for', reference, dbError.message);
      }
    }

    return { status: 200, body: { reference, network, status, settled, paid: status === 'SUCCESSFUL' } };
  } catch (error) {
    console.error('Status check failed:', error);
    return { status: 502, body: { error: 'Could not read payment status.', code: error.code || 'STATUS_ERROR' } };
  }
}
