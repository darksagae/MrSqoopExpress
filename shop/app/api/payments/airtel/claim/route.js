import { NextResponse } from 'next/server';
import { signedInUser } from '@/lib/session';
import { markAirtelMerchantClaimed } from '@/lib/payments/airtel-merchant';

export async function POST(request) {
  const user = await signedInUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId) return NextResponse.json({ error: 'Missing order number.' }, { status: 400 });
  try {
    const ok = await markAirtelMerchantClaimed(orderId, user.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (error) {
    console.error('[airtel-merchant] claim failed', orderId, error.message);
    return NextResponse.json({ error: 'Could not record that. Please try again.' }, { status: 500 });
  }
}
