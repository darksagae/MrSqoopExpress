import { NextResponse } from 'next/server';
import { checkPaymentStatus } from '@/lib/checkout';

/**
 * GET /api/orders/status?network=mtn|airtel&reference=<id>
 *
 * Authoritative payment outcome, read straight from the provider and written
 * down once settled (see lib/checkout.js): provider callbacks can't be relied
 * on, so the checkout page polls this.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = await checkPaymentStatus(searchParams.get('network'), searchParams.get('reference'));
  return NextResponse.json(result.body, { status: result.status });
}
