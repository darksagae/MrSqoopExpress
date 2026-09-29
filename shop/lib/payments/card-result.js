import { verifyResponse, outcomeFor } from './card';
import { getOrderByRef, settlePayment } from '../orders';

/**
 * Apply one signed CyberSource result to its order. Safe to call more than
 * once for the same payment: the browser return and the server-to-server
 * notification both deliver it, and settlePayment only moves PENDING rows.
 *
 * @returns {{ outcome: 'paid'|'failed'|'review'|'error', orderId: string|null }}
 */
export async function applyCardResult(fields) {
  if (!verifyResponse(fields)) {
    console.error('[CARD RESULT] bad signature', fields.req_reference_number, fields.transaction_id);
    return { outcome: 'error', orderId: null };
  }

  const orderId = fields.req_reference_number || null;
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
      console.error('[CARD RESULT] order mismatch', { orderId, ref, amount: fields.req_amount });
      return { outcome: 'error', orderId };
    }

    if (status !== 'PENDING') {
      await settlePayment(ref, status, { failureReason: status === 'SUCCESSFUL' ? null : reason });
    } else {
      console.warn('[CARD RESULT] held for review', orderId, fields.transaction_id);
    }
  } catch (dbError) {
    // The decision is signed and genuine, so still report it; ops reconciles
    // the row from this log line.
    console.error('[CARD RESULT] could not persist', orderId, ref, fields.decision, dbError.message);
  }

  const outcome = status === 'SUCCESSFUL' ? 'paid' : status === 'PENDING' ? 'review' : 'failed';
  return { outcome, orderId };
}

export async function readCardFields(request) {
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}
