import { NextResponse } from 'next/server';
import { verifyResponse, outcomeFor } from '@/lib/payments/card';
import { getOrderByRef, settlePayment } from '@/lib/orders';

/**
 * POST /checkout/card/return
 *
 * The receipt URL registered on the Secure Acceptance profile. CyberSource
 * posts the signed payment outcome here as a form, both through the
 * shopper's browser and (if configured) server-to-server. settlePayment is
 * idempotent, so receiving the same outcome twice is harmless.
 */
export async function POST(request) {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

  const redirect = (outcome, orderId) => {
    const url = new URL('/checkout/card/result', request.url);
    url.searchParams.set('outcome', outcome);
    if (orderId) url.searchParams.set('order', orderId);
    return NextResponse.redirect(url, 303);
  };

  if (!verifyResponse(fields)) {
    console.error('[CARD RETURN] bad signature', fields.req_reference_number, fields.transaction_id);
    return redirect('error');
  }

  const orderId = fields.req_reference_number;
  const ref = fields.req_transaction_uuid;
  const status = outcomeFor(fields.decision);
  const reason = `${fields.decision} ${fields.reason_code || ''}`.trim();

  try {
    const order = await getOrderByRef(ref);
    const matches =
      order &&
      order.id === orderId &&
      Number(order.amount_ugx) === Math.round(Number(fields.req_amount)) &&
      fields.req_currency === 'UGX';

    if (!matches) {
      console.error('[CARD RETURN] order mismatch', { orderId, ref, amount: fields.req_amount });
      return redirect('error', orderId);
    }

    if (status !== 'PENDING') {
      await settlePayment(ref, status, { failureReason: status === 'SUCCESSFUL' ? null : reason });
    } else {
      console.warn('[CARD RETURN] held for review', orderId, fields.transaction_id);
    }
  } catch (dbError) {
    // The decision is signed and genuine, so still tell the shopper what
    // happened; ops reconciles the row from this log line.
    console.error('[CARD RETURN] could not persist', orderId, ref, fields.decision, dbError.message);
  }

  const outcome = status === 'SUCCESSFUL' ? 'paid' : status === 'PENDING' ? 'review' : 'failed';
  return redirect(outcome, orderId);
}

export function GET(request) {
  return NextResponse.redirect(new URL('/checkout', request.url), 303);
}
