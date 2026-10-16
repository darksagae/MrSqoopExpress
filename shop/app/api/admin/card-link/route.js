import { NextResponse } from 'next/server';
import { isSettingsAdmin } from '@/lib/settings';
import { decideCardLink, listCardLinkPending } from '@/lib/payments/card-link';

/**
 * GET  /api/admin/card-link                      card payments waiting for a check
 * POST /api/admin/card-link { orderId, received } the admin's answer
 *
 * Called by the admin site (never the browser) with the shared ingest secret.
 * See lib/payments/card-link.js.
 */
const denied = () => NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

export async function GET(request) {
  if (!isSettingsAdmin(request)) return denied();
  try {
    return NextResponse.json({ payments: await listCardLinkPending() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[card-link] list failed', e.message);
    return NextResponse.json({ error: 'Could not load card payments.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSettingsAdmin(request)) return denied();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const orderId = String(body?.orderId || '').trim();
  if (!orderId || typeof body?.received !== 'boolean') {
    return NextResponse.json({ error: 'Send the order number and whether the payment was received.' }, { status: 400 });
  }
  try {
    const r = await decideCardLink(orderId, body.received);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  } catch (e) {
    console.error('[card-link] decision failed', orderId, e.message);
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 });
  }
}
