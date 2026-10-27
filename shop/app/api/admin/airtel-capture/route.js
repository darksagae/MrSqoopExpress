import crypto from 'node:crypto';
import { getSql } from '@/lib/db';
import { egressFetch, isEgressConfigured } from '@/lib/egress';
import { collectionFields, normalizeWallet } from '@/lib/payments/lipapay-request';
import { billEnquiry, getPaymentResult, orderDetails, verifySignature } from '@/lib/payments/lipapay';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
function permit(request) {
  const token = process.env.AIRTEL_CAPTURE_TOKEN || '';
  const [issued, id, binding] = token.split(':');
  const age = Date.now() - Number(issued);
  const given = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || age < 0 || age > 30 * 60000 || given.length !== expected.length || !crypto.timingSafeEqual(given, expected) || !/^AIRTELLIVE\d{13}$/.test(id)) return null;
  return { id, binding };
}
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) =>
    [k, /^(sign|privatekey|authorization)$/i.test(k) ? '[REDACTED]' : /^(TraderID|partyId)$/i.test(k) ? '[phone]' : clean(v)]));
  return value;
}
const log = (event, data) => console.info('[AIRTEL LIVE '+event+'] '+JSON.stringify(clean(data)));
export async function POST(request) {
  const auth = permit(request);
  if (!auth) return reply({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  if (body.amountUGX !== 700 || typeof body.name !== 'string' || body.name.length > 80 || digest(`${body.phone}|700|${body.name}`) !== auth.binding) return reply({ error: 'Not the authorized collection.' }, 400);
  if (!process.env.LIPAPAY_PRIVATE_KEY) return reply({ error: 'Merchant signing key missing.' },503);
  if (!isEgressConfigured() || new URL(process.env.EGRESS_PROXY_URL).hostname !== '149.28.41.169') return reply({ error: 'Whitelisted VPS path is required.' }, 503);
  const fields = collectionFields({ merchantId: process.env.LIPAPAY_MCH_ID, notifyUrl: process.env.LIPAPAY_NOTIFY_URL,
    phone: normalizeWallet(body.phone), amountUGX: 700, orderId: auth.id, network: 'airtel', note: 'Authorized live AIRTEL collection' });
  fields.TraderFullName = body.name;
  const sql = getSql();
  const rows = await sql`INSERT INTO payment_probes (id,source_order_id,amount_ugx,state)
    VALUES (${auth.id},'USER-AUTHORIZED-AIRTEL',700,'PREPARING') ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (!rows.length) return reply({ reference: auth.id, error: 'Already attempted. Query this reference; do not submit again.' }, 409);
  try {
    const quote = await billEnquiry({ phone: body.phone, amountUGX: 700, channel: 2 });
    const debit = Number(quote.data?.ActualPaymentAmount);
    log('FEE QUOTE', { reference: auth.id, ok: quote.ok, debitUGX: debit, statusCode: quote.statusCode });
    if (!quote.ok || !Number.isFinite(debit) || debit < 700 || debit > 715) {
      await sql`UPDATE payment_probes SET state='NOT_SUBMITTED',detail='Fee quote outside permitted limit',updated_at=now() WHERE id=${auth.id}`;
      return reply({ reference: auth.id, state: 'NOT_SUBMITTED', quotedDebitUGX: debit, error: 'Fee quote outside permitted limit.' }, 400);
    }
    // Retain the exact timestamp used for the actual collection, not the fee lookup.
    fields.TimeStamp = Math.floor(Date.now()/1000);
    const base = Object.entries(fields).filter(([,v])=>v!=='' && v!=null).map(([k,v])=>`${k}=${v}`).join('&');
    const Sign = crypto.createHash('md5').update(base+'&privateKey='+process.env.LIPAPAY_PRIVATE_KEY).digest('hex');
    const endpoint = (process.env.LIPAPAY_BASE_URL || 'https://pay.lipapayug.com')+'/api/pay/unifiedorder';
    if (new URL(endpoint).hostname !== 'pay.lipapayug.com') throw Error('Production LipaPay endpoint required.');
    await sql`UPDATE payment_probes SET state='REQUESTING',detail=${JSON.stringify(clean(fields))},updated_at=now() WHERE id=${auth.id}`;
    log('REQUEST', { reference: auth.id, endpoint, sourceIP: '149.28.41.169', parameters: { ...fields, Sign } });
    const response = await egressFetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...fields, Sign }), signal: AbortSignal.timeout(20000) });
    const raw = await response.text();
    let provider; try { provider = JSON.parse(raw); } catch { provider = { malformedResponse: raw.slice(0,1000) }; }
    const receiptSignatureValid = provider.Succeeded === true && verifySignature(raw, ['OutTradeNo','TransactionId','ActualPaymentAmount','ActualCollectAmount','PayerCharge','PayeeCharge','ChannelCharge']);
    const state = provider.Succeeded === true ? 'PENDING' : 'UNKNOWN';
    const result = { reference: auth.id, state, amountUGX:700, quotedDebitUGX:debit, httpStatus:response.status, parameters:clean({...fields,Sign}), provider:clean(provider), receiptSignatureValid };
    const ref = typeof provider.Data?.TransactionId === 'string' ? provider.Data.TransactionId : null;
    log('RESPONSE', result);
    await sql`UPDATE payment_probes SET state=${state},platform_ref=${ref},detail=${JSON.stringify(result)},updated_at=now() WHERE id=${auth.id}`;
    return reply(result);
  } catch (error) {
    const result = { reference:auth.id,state:'UNKNOWN',error:clean(error.message),instruction:'Do not retry collection; query this reference.' };
    log('ERROR', result);
    await sql`UPDATE payment_probes SET state='UNKNOWN',detail=${JSON.stringify(result)},updated_at=now() WHERE id=${auth.id}`;
    return reply(result,502);
  }
}
export async function GET(request) {
  const auth = permit(request);
  if (!auth) return reply({ error:'Unauthorized' },401);
  const sql = getSql();
  const [record] = await sql`SELECT id,state,platform_ref,detail,created_at,updated_at FROM payment_probes WHERE id=${auth.id}`;
  if (!record) return reply({ error:'Not submitted' },404);
  if (record.state==='NOT_SUBMITTED') return reply(clean(record));
  const outcome = await getPaymentResult(auth.id);
  const details = await orderDetails(auth.id);
  const result = { reference:auth.id, status:outcome.status, reason:outcome.reason, details, audit:record };
  log('STATUS',result);
  return reply(clean(result));
}
