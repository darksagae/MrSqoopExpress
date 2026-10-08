import { NextResponse } from 'next/server';
import { isSettingsAdmin } from '@/lib/settings';
import { placeSupplierOrder } from '@/lib/supplier';

/**
 * POST /api/admin/supplier-order  { orderId }
 * Called by the admin site (shared secret) when the operator presses
 * "Place order with supplier". Safe to repeat: an order is never placed twice.
 */
export const maxDuration = 60;

export async function POST(request) {
  if (!isSettingsAdmin(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const orderId = String(body?.orderId || '').trim();
  if (!orderId) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 });

  try {
    const r = await placeSupplierOrder(orderId);
    const status = r.ok ? 200 : r.code === 'NOT_FOUND' ? 404 : r.code === 'IN_PROGRESS' || r.code === 'NOT_PAID' ? 409 : 502;
    return NextResponse.json(r, { status });
  } catch (e) {
    console.error('[supplier-order] failed', orderId, e.message);
    return NextResponse.json({ ok: false, error: 'Could not place the order right now.' }, { status: 500 });
  }
}
