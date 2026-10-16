import { NextResponse } from 'next/server';
import { signedInUser } from '@/lib/session';
import { markCardClaimed } from '@/lib/payments/card-link';

/**
 * POST /api/payments/card/claim  { orderId }
 *
 * The customer pressed "I've paid" after paying on Absa's card page. This only
 * flags the order for the admin to check; it never marks anything paid.
 */
export async function POST(request) {
  const account = await signedInUser();
  if (!account) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const orderId = String(body?.orderId || '').trim();
  if (!orderId) return NextResponse.json({ error: 'Missing order number.' }, { status: 400 });
  try {
    const ok = await markCardClaimed(orderId, account.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch (e) {
    console.error('[card-link] claim failed', orderId, e.message);
    return NextResponse.json({ error: 'Could not record that. Please try again.' }, { status: 500 });
  }
}
