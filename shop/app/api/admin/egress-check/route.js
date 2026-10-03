import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { egressFetch, isEgressConfigured } from '@/lib/egress';

/**
 * GET /api/admin/egress-check   (Authorization: Bearer <EGRESS_CHECK_TOKEN>)
 *
 * Proves the fixed-IP path end to end: sends an unsigned request to LipaPay's
 * IP-gated endpoint through the egress proxy. Nothing is charged. LipaPay's
 * answer says which IP it saw and whether that IP is whitelisted yet.
 */
function authorized(request) {
  const token = process.env.EGRESS_CHECK_TOKEN;
  if (!token) return false;
  const given = Buffer.from(request.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isEgressConfigured()) return NextResponse.json({ viaProxy: false, error: 'EGRESS_PROXY_* not set' });

  const base = process.env.LIPAPAY_BASE_URL || 'https://pay.lipapayug.com';
  const started = Date.now();
  try {
    const res = await egressFetch(`${base}/api/pay/bill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    const text = (await res.text()).slice(0, 400);
    const seenIp = text.match(/IP address \(([\d.]+)\)/)?.[1] || null;
    return NextResponse.json({
      viaProxy: true,
      ms: Date.now() - started,
      httpStatus: res.status,
      lipapaySaw: seenIp,
      whitelisted: !/not authorized/i.test(text),
      lipapaySaid: text,
    });
  } catch (e) {
    return NextResponse.json({ viaProxy: true, ms: Date.now() - started, error: e.cause?.message || e.message });
  }
}
