import { getSql } from '../db.js';
import { ensureAccountColumns } from '../orders.js';

export const AIRTEL_MERCHANT_CODE = '4430722';
export const AIRTEL_MERCHANT_USSD = '*185*9#';
export const AIRTEL_MERCHANT_PREFIX = 'AIRTELMERCHANT-';
export const isAirtelMerchantRef = (ref) => String(ref || '').startsWith(AIRTEL_MERCHANT_PREFIX);

export function airtelMerchantInstructions(orderId, amountUGX) {
  return { mode: 'airtel-merchant', reference: AIRTEL_MERCHANT_PREFIX + orderId,
    merchantCode: AIRTEL_MERCHANT_CODE, ussd: AIRTEL_MERCHANT_USSD, amountUGX };
}

// A customer claim is only a request for review, never payment confirmation.
export async function markAirtelMerchantClaimed(orderId, userId) {
  if (!(await ensureAccountColumns())) return false;
  const rows = await getSql()`
    UPDATE orders SET card_claimed_at = COALESCE(card_claimed_at, now()), updated_at = now()
     WHERE id = ${orderId} AND user_id = ${userId} AND network = 'airtel'
       AND payment_status = 'PENDING' AND payment_ref LIKE ${AIRTEL_MERCHANT_PREFIX + '%'}
    RETURNING id
  `;
  return rows.length > 0;
}
