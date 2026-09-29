import { applyCardResult, readCardFields } from '@/lib/payments/card-result';

/**
 * POST /api/payments/card/notify
 *
 * The Merchant POST URL on the Secure Acceptance profile: CyberSource sends
 * the same signed result here server-to-server, so a paid order still
 * settles when the shopper closes the browser before the return redirect.
 */
export async function POST(request) {
  const { outcome, orderId } = await applyCardResult(await readCardFields(request));
  console.log('[CARD NOTIFY]', orderId, outcome);
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
