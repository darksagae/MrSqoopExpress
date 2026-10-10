import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { isVoiceServerConfigured, voiceServerFetch } from '@/lib/assist/voice-server';
import { egressFetch, isEgressConfigured } from '@/lib/egress';
import { billEnquiry, isLipaPayConfigured } from '@/lib/payments/lipapay';

/**
 * GET /api/admin/egress-check?phone=07XXXXXXXX
 *     (Authorization: Bearer <EGRESS_CHECK_TOKEN>)
 *
 * Proves the fixed-IP path end to end through the egress proxy. Nothing is
 * charged. With LipaPay credentials set and a phone given, it runs a signed
 * bill enquiry (IP-gated), which tells us definitively whether our IP is
 * whitelisted. Otherwise it only proves the tunnel reaches LipaPay: an
 * unsigned request is rejected on its fields before the IP is ever checked.
 *
 * GET /api/admin/egress-check?voice=1 instead reports the voice server's
 * /health (it runs on the same Vultr server), since only Vercel can reach it.
 */
function authorized(request) {
  const token = process.env.EGRESS_CHECK_TOKEN;
  if (!token) return false;
  const given = Buffer.from(request.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

async function voiceHealth() {
  if (!isVoiceServerConfigured()) return { voice: 'VOICE_SERVER_* not set' };
  const started = Date.now();
  try {
    const res = await voiceServerFetch('/health', { signal: AbortSignal.timeout(10000) });
    return { voice: res.status, ms: Date.now() - started, said: (await res.text()).slice(0, 600) };
  } catch (e) {
    return { voice: 'unreachable', ms: Date.now() - started, error: e.cause?.code || e.cause?.message || e.message };
  }
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(request.url).searchParams.get('voice')) return NextResponse.json(await voiceHealth());
  if (!isEgressConfigured()) return NextResponse.json({ viaProxy: false, error: 'EGRESS_PROXY_* not set' });

  const phone = new URL(request.url).searchParams.get('phone');
  if (phone && isLipaPayConfigured()) {
    const started = Date.now();
    try {
      const r = await billEnquiry({ phone });
      const blocked = r.statusCode === 403 || /not authorized/i.test(r.errors || '');
      return NextResponse.json({
        viaProxy: true,
        signed: true,
        ms: Date.now() - started,
        whitelisted: !blocked,
        lipapaySaw: (r.errors || '').match(/IP address \(([\d.]+)\)/)?.[1] || null,
        result: r,
      });
    } catch (e) {
      return NextResponse.json({ viaProxy: true, signed: true, error: e.cause?.message || e.message });
    }
  }

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
      // Unsigned, so LipaPay rejects the fields before checking the IP; only a
      // signed request (pass ?phone= with LipaPay configured) can confirm it.
      whitelisted: /not authorized/i.test(text) ? false : 'unknown (needs a signed request)',
      lipapaySaid: text,
    });
  } catch (e) {
    return NextResponse.json({ viaProxy: true, ms: Date.now() - started, error: e.cause?.message || e.message });
  }
}
