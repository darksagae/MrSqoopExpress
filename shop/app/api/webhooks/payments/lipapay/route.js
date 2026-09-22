import { getPaymentStatus, verifySignature, RESULT_FIELDS, payStatusToString } from '@/lib/payments/lipapay';
import { settlePayment } from '@/lib/orders';

/**
 * LipaPay posts the outcome of a unified order here (the NotifyUrl we set on
 * the original request).
 *
 * Three things drive the shape of this handler:
 *
 *  - LipaPay expects the literal body "SUCCESS" with HTTP 200. Anything else —
 *    wrong body, non-200, timeout — counts as a delivery failure and it retries
 *    on 1s → 30s → 30s → 30s for up to 24 hours.
 *  - Duplicates are therefore expected, so settling has to be idempotent.
 *  - Unlike MTN's unsigned callbacks, these carry an MD5 Sign. We check it, and
 *    then still re-confirm with orderquery before releasing anything: the
 *    signature proves the message is authentic, the query proves it is current.
 *
 * Note the signature covers the payload fields EXCEPT PayMessage, and must be
 * computed from the raw bytes — JSON.parse rewrites decimals ("50000.00" →
 * 50000) and every check would fail. See LIPAPAY_API_REFERENCE.md §7.8.
 */

/** LipaPay only treats this exact body as an acknowledgement. */
const ack = () => new Response('SUCCESS', {
  status: 200,
  headers: { 'Content-Type': 'text/plain' },
});

/** Anything that isn't an ack tells LipaPay to retry later. */
const retryLater = (reason) => new Response(reason, {
  status: 200,
  headers: { 'Content-Type': 'text/plain' },
});

export async function POST(request) {
  // Raw text, not request.json() — the signature is over these exact bytes.
  const raw = await request.text();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('INVALID JSON', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const outTradeNo = payload.OutTradeNo;
  const claimed = payStatusToString(payload.PayStatus);

  console.log('LipaPay callback received:', {
    outTradeNo,
    claimed,
    transactionId: payload.TransactionId,
  });

  if (!outTradeNo) {
    return new Response('MISSING OutTradeNo', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  // A forged callback is the one way an unpaid order could be marked paid.
  if (!verifySignature(raw, RESULT_FIELDS)) {
    console.warn('LipaPay callback FAILED signature verification:', outTradeNo);
    return new Response('BAD SIGNATURE', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  // Authentic, but possibly stale — ask LipaPay what the order looks like now.
  let verified;
  try {
    verified = await getPaymentStatus(outTradeNo);
  } catch (error) {
    // Don't acknowledge: a retry is exactly what we want after a transient fault.
    console.error('Could not confirm LipaPay callback:', outTradeNo, error.message);
    return retryLater('PENDING VERIFICATION');
  }

  if (verified !== 'SUCCESSFUL' && verified !== 'FAILED') {
    // Still processing. Acknowledge so LipaPay stops resending this particular
    // notification; the final state arrives in its own callback, and the
    // checkout page is polling /api/orders/status regardless.
    return ack();
  }

  try {
    // settlePayment is a no-op when the poll already recorded the outcome,
    // which is what makes repeated deliveries safe.
    const { changed } = await settlePayment(outTradeNo, verified, {
      failureReason: verified === 'SUCCESSFUL' ? null : (payload.PayMessage || verified),
    });
    console.log('LipaPay callback settled:', { outTradeNo, verified, changed });
  } catch (dbError) {
    // Let it retry rather than losing the outcome.
    console.error('Could not persist LipaPay outcome:', outTradeNo, dbError.message);
    return retryLater('PERSIST FAILED');
  }

  return ack();
}
