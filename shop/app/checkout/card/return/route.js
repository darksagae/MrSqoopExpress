import { NextResponse } from 'next/server';
import { applyCardResult, readCardFields } from '@/lib/payments/card-result';

/**
 * POST /checkout/card/return
 *
 * The Customer Response page on the Secure Acceptance profile: CyberSource
 * posts the signed result here through the shopper's browser, and we send
 * them on to the result page.
 */
export async function POST(request) {
  const { outcome, orderId } = await applyCardResult(await readCardFields(request));
  const url = new URL('/checkout/card/result', request.url);
  url.searchParams.set('outcome', outcome);
  if (orderId) url.searchParams.set('order', orderId);
  return NextResponse.redirect(url, 303);
}

export function GET(request) {
  return NextResponse.redirect(new URL('/checkout', request.url), 303);
}
