import { NETWORK_LABEL } from './resolve.js';

/**
 * Turn the network's reason for a failed payment into one sentence a customer
 * can act on, or null when the reason is too vague to say anything useful.
 *
 * Reasons arrive raw from the network via the payment callback, e.g. MTN's
 * "LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED" (refused at once, no
 * PIN prompt sent). "Transaction not found" does not establish whether a
 * prompt was delivered or the customer approved anything.
 */
export function explainFailure(network, reason) {
  const r = String(reason || '');
  if (network === 'card') {
    return /CARD_NOT_RECEIVED/.test(r)
      ? 'We couldn’t find a card payment of the exact amount for this order. If your card was charged, contact us with your order number.'
      : null;
  }
  const wallet = NETWORK_LABEL[network] || 'Your network';
  if (/transaction not found|DP00800001025/i.test(r)) {
    return `${wallet} could not find the payment request. If no PIN prompt arrived, contact support with your order number so we can trace it.`;
  }
  if (/LOW_BALANCE|NOT_ENOUGH_FUNDS|INSUFFICIENT|LIMIT_REACHED|NOT_ALLOWED/i.test(r)) {
    return (
      `${wallet} turned the payment down before sending a PIN prompt. This usually means the ` +
      'balance on that number is less than the total, or its daily limit has been reached. ' +
      'Top up or use another number, then try again.'
    );
  }
  // MTN reports a prompt left unanswered as COULD_NOT_PERFORM_TRANSACTION.
  if (/EXPIRED|TIMEOUT|timed out|COULD_NOT_PERFORM/i.test(r)) {
    return (
      `${wallet} didn't receive an approval in time. If no PIN prompt appeared on your phone, ` +
      `check the number is registered for ${wallet} and try again.`
    );
  }
  if (/REJECT|CANCEL|DECLIN|NOT_APPROVED/i.test(r)) {
    return 'The payment was declined on the phone.';
  }
  return null;
}
