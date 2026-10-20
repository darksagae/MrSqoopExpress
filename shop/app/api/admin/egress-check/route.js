import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { isVoiceServerConfigured, voiceServerFetch } from '@/lib/assist/voice-server';
import { egressFetch, isEgressConfigured } from '@/lib/egress';
import { accountSummary, billEnquiry, isLipaPayConfigured, orderDetails } from '@/lib/payments/lipapay';
import { getOrder } from '@/lib/orders';
import { aliexpressDS } from '@/lib/aliexpress';

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
 *
 * GET /api/admin/egress-check?order=MSE-001 (comma-separated for several)
 * returns LipaPay's record of those orders, including why a payment failed.
 *
 * GET /api/admin/egress-check?formats=MSE-009 runs no-charge bill enquiries on
 * that order's number in each format, to see which ones LipaPay accepts.
 *
 * GET /api/admin/egress-check?fees=MSE-013,MSE-015 shows the amount and
 * charges LipaPay would put to each order's wallet (bill enquiry, no charge).
 *
 * GET /api/admin/egress-check?account=1 shows the merchant balance and the
 * last three days of transactions as LipaPay recorded them.
 */
function authorized(request) {
  // Short-lived operator access for payment troubleshooting only. This token
  // cannot run account, voice, supplier, or general proxy diagnostics.
  const diagnostic = process.env.PAYMENT_DIAGNOSTIC_TOKEN;
  if (diagnostic) {
    const age = Date.now() - Number(diagnostic.split(':')[0]);
    const keys = [...new URL(request.url).searchParams.keys()];
    const scoped = keys.length === 1 && ['order', 'formats', 'fees'].includes(keys[0]);
    const actual = Buffer.from(request.headers.get('authorization') || '');
    const expected = Buffer.from(`Bearer ${diagnostic}`);
    if (age >= 0 && age < 30 * 60 * 1000 && scoped && actual.length === expected.length
      && crypto.timingSafeEqual(actual, expected)) return true;
  }
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

/** Keep a number's shape (prefix, length) but hide who it is. */
const maskNumber = (n) => String(n ?? '').replace(/^(\d{3})(\d+)(\d{2})$/, (_, a, m, b) => a + '•'.repeat(m.length) + b);

/**
 * How LipaPay treats an order's own phone number in each format it might
 * accept, with auto-detect and with that network's channel. Bill enquiries
 * charge nothing. Account-holder names are left out of the reply.
 */
async function numberFormats(orderId) {
  const o = await getOrder(orderId);
  if (!o) return { error: `No order ${orderId}` };
  let n = String(o.customer_phone || '').replace(/\D/g, '');
  if (n.startsWith('256')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  const channel = { mtn: 1, airtel: 2 }[o.network];
  const tries = [];
  for (const [format, traderId] of [['local 0XXXXXXXXX', '0' + n], ['national XXXXXXXXX', n], ['international 256XXXXXXXXX', '256' + n]]) {
    for (const ch of [0, channel]) {
      try {
        const r = await billEnquiry({ phone: traderId, traderId, channel: ch });
        tries.push({
          format,
          channel: ch,
          ok: r.ok,
          statusCode: r.statusCode,
          errors: r.errors,
          lipapayUsed: r.data ? maskNumber(r.data.TraderID) : null,
          fields: r.data ? Object.keys(r.data) : null,
        });
      } catch (e) {
        tries.push({ format, channel: ch, error: e.message });
      }
    }
  }
  return { order: orderId, network: o.network, tries };
}

/**
 * What LipaPay would ask the customer's wallet for on an order: its amount and
 * charges from a no-charge bill enquiry on the order's own number and total.
 * Account-holder names are left out of the reply.
 */
async function orderFees(orderId) {
  const o = await getOrder(orderId);
  if (!o) return { error: `No order ${orderId}` };
  const channel = { mtn: 1, airtel: 2 }[o.network];
  const out = { network: o.network, amountUGX: Number(o.amount_ugx), tries: [] };
  for (const ch of [channel, 0]) {
    try {
      const r = await billEnquiry({ phone: o.customer_phone, amountUGX: Number(o.amount_ugx), channel: ch });
      const { GivenName, FamilyName, FullName, Sign, TraderID, ...money } = r.data || {};
      out.tries.push({ channel: ch, ok: r.ok, statusCode: r.statusCode, errors: r.errors, ...money });
    } catch (e) {
      out.tries.push({ channel: ch, error: e.message });
    }
  }
  return out;
}

/**
 * Why the supplier won't quote an order's shipping to the warehouse: each line
 * as stored, then the same freight lookup the admin's "Place order" makes,
 * and the same for one unit, each answered raw.
 */
async function supplierFreight(orderId) {
  const o = await getOrder(orderId);
  if (!o) return { error: `No order ${orderId}` };
  const items = Array.isArray(o.items) ? o.items : [];
  const lines = [];
  for (const line of items) {
    const productId = String(line.id || '').split(':')[0];
    const qty = Math.max(1, Number(line.qty) || 1);
    const out = { productId, skuId: line.skuId || null, qty, paidShipUGX: line.shipUGX, tries: [] };
    // The supplier client only ever asks about the warehouse (AE, Dubai/Dubai).
    const variants = [
      ['as placed: full qty', { quantity: qty }],
      ['one unit', { quantity: 1 }],
    ];
    for (const [label, args] of variants) {
      try {
        const f = await aliexpressDS.queryFreight({ productId, skuId: line.skuId, ...args });
        out.tries.push({ label, ok: true, deliverable: f.deliverable, free: f.freeShipping, shipUSD: f.shippingCostUSD, service: f.serviceCode, reason: f.reason });
      } catch (e) {
        out.tries.push({ label, ok: false, code: e.code, error: e.message });
      }
    }
    lines.push(out);
  }
  return { order: orderId, lines };
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (new URL(request.url).searchParams.get('voice')) return NextResponse.json(await voiceHealth());
  const formatsOf = new URL(request.url).searchParams.get('formats');
  if (formatsOf) return NextResponse.json(await numberFormats(formatsOf.trim()));
  const supplierOf = new URL(request.url).searchParams.get('supplier');
  if (supplierOf) return NextResponse.json(await supplierFreight(supplierOf.trim()));
  if (new URL(request.url).searchParams.get('account')) {
    // Today and the two days before, in LipaPay's yyyyMMdd form.
    const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const a = await accountSummary({ startDay: day(2), endDay: day(0) });
      // Network replies quote the payer's full number; keep only its last digits.
      const masked = JSON.parse(JSON.stringify(a).replace(/\d{5,}(\d{3})(?=\D|$)/g, (m, end) =>
        /^(256|0)?7\d{8}$/.test(m) ? '•••' + end : m));
      return NextResponse.json({ account: masked });
    } catch (e) {
      return NextResponse.json({ account: { error: e.message } });
    }
  }
  const feesOf = new URL(request.url).searchParams.get('fees');
  if (feesOf) {
    const ids = feesOf.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
    const results = {};
    for (const id of ids) results[id] = await orderFees(id);
    return NextResponse.json({ fees: results });
  }
  const orders = new URL(request.url).searchParams.get('order');
  if (orders) {
    const ids = orders.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const results = {};
    for (const id of ids) {
      try {
        results[id] = { lipapay: await orderDetails(id) };
      } catch (e) {
        results[id] = { lipapay: { error: e.message } };
      }
      // Our side: which network, when it was placed, and what we recorded.
      try {
        const o = await getOrder(id);
        if (o) {
          results[id].shop = {
            network: o.network,
            phone: String(o.customer_phone || '').replace(/\d(?=\d{3})/g, '•'),
            amountUGX: Number(o.amount_ugx),
            placedAt: o.created_at,
            paymentStatus: o.payment_status,
            failureReason: o.failure_reason,
            paymentRef: o.payment_ref,
          };
        }
      } catch (e) {
        results[id].shop = { error: e.message };
      }
    }
    return NextResponse.json({ orders: results });
  }
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
