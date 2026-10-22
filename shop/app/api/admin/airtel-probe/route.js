import crypto from 'node:crypto';
import { getSql } from '@/lib/db';
import { getOrder } from '@/lib/orders';
import { billEnquiry, requestToPay, getPaymentResult, isLipaPayConfigured } from '@/lib/payments/lipapay';

// Temporary, single-reference live test. The credential binds the source order
// and unique test ID; a database claim prevents repeat requests from charging twice.
const response = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function access(request) {
  const token = process.env.AIRTEL_PROBE_TOKEN || '';
  const [issued, sourceOrderId, testId] = token.split(':');
  const age = Date.now() - Number(issued);
  const a = Buffer.from(request.headers.get('authorization') || '');
  const b = Buffer.from(`Bearer ${token}`);
  if (!token || !(age >= 0 && age < 30 * 60 * 1000) || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^MSE-\d+$/.test(sourceOrderId) || !/^AIRTEST\d{13}$/.test(testId)) return null;
  return { sourceOrderId, testId };
}
const digits = (p) => String(p || '').replace(/\D/g, '').replace(/^256/, '0');
const safe = (text) => String(text || '').replace(/(?:256|0)?7\d{8}/g, '[phone]');
async function table() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS payment_probes (
    id TEXT PRIMARY KEY, source_order_id TEXT NOT NULL, amount_ugx INTEGER NOT NULL,
    state TEXT NOT NULL, platform_ref TEXT, detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  return sql;
}
export async function POST(request) {
  const permit = access(request);
  if (!permit) return response({ error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const order = await getOrder(permit.sourceOrderId);
  // The only allowed debit is 500 UGX on the already-authorized source wallet.
  if (!order || order.network !== 'airtel' || body.amountUGX !== 500 || digits(body.phone) !== digits(order.customer_phone)) {
    return response({ error: 'Test does not match the authorized wallet and amount.' }, 400);
  }
  if (!isLipaPayConfigured()) return response({ error: 'Provider not configured.' }, 503);
  const sql = await table();
  const claim = await sql`INSERT INTO payment_probes (id, source_order_id, amount_ugx, state)
    VALUES (${permit.testId}, ${permit.sourceOrderId}, 500, 'PREPARING')
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (!claim.length) return response({ testId: permit.testId, error: 'Already attempted. Query status; do not resubmit.' }, 409);
  try {
    const bill = await billEnquiry({ phone: order.customer_phone, amountUGX: 500, channel: 2 });
    const debit = Number(bill.data?.ActualPaymentAmount);
    if (!bill.ok || !Number.isFinite(debit) || debit < 500 || debit > 508) {
      await sql`UPDATE payment_probes SET state='NOT_SUBMITTED', detail='Fee preview not acceptable', updated_at=now() WHERE id=${permit.testId}`;
      return response({ testId: permit.testId, error: 'Fee preview not acceptable; nothing submitted.' }, 400);
    }
    await sql`UPDATE payment_probes SET state='REQUESTING', updated_at=now() WHERE id=${permit.testId}`;
    console.info('[AIRTEST REQUEST]', JSON.stringify({ testId: permit.testId, amountUGX: 500, quotedWalletDebitUGX: debit, channel: 2, processor: 'LipaPay', via: 'whitelisted VPS proxy' }));
    const receipt = await requestToPay({ amountUGX: 500, phone: order.customer_phone,
      orderId: permit.testId, network: 'airtel', note: 'Authorized Airtel collection integration test' });
    await sql`UPDATE payment_probes SET state='PENDING', platform_ref=${receipt.platformRef}, updated_at=now() WHERE id=${permit.testId}`;
    return response({ testId: permit.testId, state: 'PENDING', amountUGX: 500, quotedWalletDebitUGX: debit, platformRef: receipt.platformRef });
  } catch (error) {
    console.error('[AIRTEST COLLECTION ERROR]', JSON.stringify({ testId: permit.testId, code: error.code, message: safe(error.message), paymentUncertain: Boolean(error.paymentUncertain) }));
    // A transport error can occur after acceptance. Never retry automatically.
    await sql`UPDATE payment_probes SET state='UNKNOWN', detail=${safe(error.message)}, updated_at=now() WHERE id=${permit.testId}`;
    return response({ testId: permit.testId, state: 'UNKNOWN', error: safe(error.message), instruction: 'Query this reference; do not create a second test.' }, 502);
  }
}
export async function GET(request) {
  const permit = access(request);
  if (!permit) return response({ error: 'Unauthorized' }, 401);
  const sql = await table();
  const [probe] = await sql`SELECT id, state, platform_ref FROM payment_probes WHERE id=${permit.testId}`;
  if (!probe) return response({ error: 'Not submitted.' }, 404);
  if (probe.state === 'NOT_SUBMITTED') return response(probe);
  const outcome = await getPaymentResult(permit.testId);
  console.info('[AIRTEST STATUS]', JSON.stringify({ testId: permit.testId, status: outcome.status, providerMessage: safe(outcome.reason) }));
  await sql`UPDATE payment_probes SET state=${outcome.status}, detail=${safe(outcome.reason)}, updated_at=now() WHERE id=${permit.testId}`;
  return response({ testId: permit.testId, platformRef: probe.platform_ref, status: outcome.status, message: safe(outcome.reason) });
}
