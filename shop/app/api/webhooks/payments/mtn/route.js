import { NextResponse } from 'next/server';
import { getPaymentStatus } from '@/lib/payments/mtn';
import { settlePayment, getOrderByRef } from '@/lib/orders';

/**
 * MTN MoMo delivers the outcome of a requesttopay here (the X-Callback-Url we
 * set on the original request).
 *
 * Per MTN's docs, three things drive the shape of this handler:
 *
 *  - The platform sends callbacks with PUT, so the listener must accept PUT as
 *    well as POST ("Allow PUT & POST on your callback listener host").
 *  - The callback is sent exactly once with no retry. If it is missed, the only
 *    way to learn the outcome is GET /requesttopay/{referenceId}. So a reconcile
 *    job polling pending transactions is required, not optional.
 *  - Callbacks are unsigned, so the body is not proof of payment. Confirm via
 *    getPaymentStatus(referenceId) before releasing anything of value.
 */
async function handleCallback(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON' }, { status: 400 });
  }

  const externalId = payload.externalId;
  const claimedStatus = String(payload.status || payload.transactionStatus || '').toUpperCase();

  console.log('MTN callback received:', { externalId, claimedStatus });

  if (!externalId) {
    return NextResponse.json({ error: 'Missing externalId' }, { status: 400 });
  }

  // externalId is our order id; the provider reference is what MTN indexes the
  // transaction by, and it is what we stored.
  const order = await getOrderByRef(payload.referenceId || '') || null;
  const reference = order?.payment_ref || payload.referenceId;

  if (!reference) {
    // Nothing to verify against. Acknowledge so MTN doesn't consider it a
    // delivery failure, but do not act on an unverifiable claim.
    console.warn('MTN callback without a resolvable reference for order', externalId);
    return NextResponse.json({ received: true, acted: false, reason: 'unknown reference' });
  }

  // The callback body is unsigned — anyone who learns the URL could POST a
  // "SUCCESSFUL". Treat it purely as a hint to go ask MTN, and act only on
  // what MTN itself reports.
  let verified;
  try {
    verified = String(await getPaymentStatus(reference)).toUpperCase();
  } catch (error) {
    console.error('Could not verify callback with MTN:', error.message);
    return NextResponse.json({ received: true, acted: false, reason: 'verification failed' });
  }

  if (verified !== 'SUCCESSFUL' && verified !== 'FAILED' && verified !== 'REJECTED') {
    return NextResponse.json({ received: true, acted: false, status: verified });
  }

  const { changed } = await settlePayment(
    reference,
    verified === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILED',
    { failureReason: verified === 'SUCCESSFUL' ? null : verified }
  );

  return NextResponse.json({
    received: true,
    acted: changed, // false when the poll already settled it — not an error
    orderId: externalId,
    claimedStatus,
    verifiedStatus: verified,
  });
}

// MTN uses PUT for callbacks; POST is accepted too since the docs tell you to
// allow both.
export const PUT = handleCallback;
export const POST = handleCallback;

