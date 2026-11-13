import { NextResponse } from 'next/server';
import { isSettingsAdmin } from '@/lib/settings';
import { getSql } from '@/lib/db';

// Server-to-server bridge. Never return payment references, addresses or items.
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isSettingsAdmin(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
  const q = new URL(request.url).searchParams.get('q')?.trim().replace(/^#/, '').replace(/^order\s*/i, '') || '';
  if (!q || q.length > 100) return NextResponse.json({ error: 'Invalid query.' }, { status: 400, headers });
  const digits = q.replace(/\D/g, '');
  const phone = /^\+?[\d\s()-]+$/.test(q) && /^(?:0|256)?7\d{8}$/.test(digits) ? digits.slice(-9) : '';
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, customer_name, customer_phone, amount_ugx, payment_status, created_at, paid_at
      FROM orders WHERE lower(id) = lower(${q})
        OR (${phone} <> '' AND right(regexp_replace(customer_phone, '[^0-9]', '', 'g'), 9) = ${phone})
      ORDER BY created_at DESC LIMIT 1`;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: 'Order not found.' }, { status: 404, headers });
    const createdAt = new Date(row.created_at).toISOString();
    return NextResponse.json({ order: {
      id: row.id, trackingId: row.id, source: 'shop', paymentStatus: row.payment_status,
      customerName: row.customer_name, phone: row.customer_phone, websiteShippedFrom: 'AliExpress',
      billingUgx: Number(row.amount_ugx), createdAt, currentStageIndex: 0,
      statusHistory: [{ stageIndex: 0, timestamp: row.paid_at ? new Date(row.paid_at).toISOString() : createdAt }],
    } }, { headers });
  } catch {
    return NextResponse.json({ error: 'Shop tracking is temporarily unavailable.' }, { status: 503, headers });
  }
}
