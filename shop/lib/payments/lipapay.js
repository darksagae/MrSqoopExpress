import crypto from 'crypto';
import { egressFetch } from '../egress.js';
import { collectionFields, normalizeWallet } from './lipapay-request.js';

/**
 * LipaPay — aggregated MTN Mobile Money + Airtel Money collection.
 *
 * One API in front of both wallets, so this single provider replaces the
 * direct mtn.js / airtel.js integrations when enabled. The customer never
 * sees the word "LipaPay": they picked MTN or Airtel, the prompt arrives from
 * MTN or Airtel, and that is what the UI says. LipaPay is the processor in
 * between, the same way a card checkout says "Visa" rather than "Stripe".
 *
 * Credentials come from the LipaPay merchant dashboard (admin.lipapayug.com):
 *   LIPAPAY_MCH_ID       — merchant ID
 *   LIPAPAY_PRIVATE_KEY  — signing key. Never sent in a request; used only to
 *                          compute the MD5 Sign locally.
 *   LIPAPAY_BASE_URL     — https://pay.lipapayug.com (production)
 *                          http://dev.pay.lipapayug.com (sandbox; 502 as of writing)
 *   LIPAPAY_NOTIFY_URL   — absolute URL of our callback endpoint
 *
 * See LIPAPAY_API_REFERENCE.md for the full protocol and the verified list of
 * places the vendor docs are wrong.
 *
 * NOTE: LipaPay IP-whitelists its transactional endpoints. Vercel serverless
 * has dynamic egress IPs, so calls go out through the fixed-IP egress proxy
 * (lib/egress.js, infra/egress-proxy) once EGRESS_PROXY_* is set.
 */

const MCH_ID = process.env.LIPAPAY_MCH_ID;
const PRIVATE_KEY = process.env.LIPAPAY_PRIVATE_KEY;
const BASE_URL = process.env.LIPAPAY_BASE_URL || 'https://pay.lipapayug.com';
const NOTIFY_URL = process.env.LIPAPAY_NOTIFY_URL;

/** UGX below this is rejected by the platform. */
export const MIN_AMOUNT_UGX = 500;

export function isLipaPayConfigured() {
  return Boolean(MCH_ID && PRIVATE_KEY && NOTIFY_URL);
}

export function lipapayMissing() {
  const m = [];
  if (!MCH_ID) m.push('LIPAPAY_MCH_ID');
  if (!PRIVATE_KEY) m.push('LIPAPAY_PRIVATE_KEY');
  if (!NOTIFY_URL) m.push('LIPAPAY_NOTIFY_URL');
  return m;
}

/**
 * MD5 signature over the given fields plus the private key.
 *
 * `fields` must be insertion-ordered to match the endpoint's parameter table
 * in the API reference — NOT sorted alphabetically, which is the usual
 * instinct and produces a 401. Null/empty values are omitted.
 */
function sign(fields) {
  const base = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto.createHash('md5').update(`${base}&privateKey=${PRIVATE_KEY}`, 'utf8').digest('hex');
}

/**
 * Read a field straight out of the raw response text.
 *
 * LipaPay signs the literal decimal it sent ("50000.00"), and JSON.parse
 * collapses that to a Number whose re-serialisation ("50000") hashes
 * differently. Signature checks only work against the characters on the wire.
 */
function rawField(text, key) {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*("[^"]*"|[^,}\\s]+)`));
  if (!m) return undefined;
  return m[1].startsWith('"') ? m[1].slice(1, -1) : m[1];
}

/**
 * Verify a signed payload (response Data object, or a callback body) against
 * the fields listed, in order. Returns false on any mismatch.
 *
 * Exported because the webhook route needs it: a forged callback is the one
 * way someone could mark an unpaid order as paid.
 */
export function verifySignature(rawText, fieldOrder) {
  const expected = rawField(rawText, 'Sign');
  if (!expected || !/^[a-f0-9]{32}$/.test(expected)) return false;
  const fields = {};
  for (const key of fieldOrder) {
    const v = rawField(rawText, key);
    if (v !== undefined && v !== '' && v !== 'null') fields[key] = v;
  }
  // Length-independent compare is overkill for a hex digest, but costs nothing.
  const computed = sign(fields);
  return computed.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expected));
}

/** Field order of a payment-result payload — used by both orderquery and callbacks. */
export const RESULT_FIELDS = [
  'PayStatus',
  'PayTime',
  'OutTradeNo',
  'TransactionId',
  'Amount',
  'ActualPaymentAmount',
  'ActualCollectAmount',
  'PayerCharge',
  'PayeeCharge',
  // PayMessage is deliberately absent: it ships in the payload but is excluded
  // from the signature. Including it makes every verification fail.
];

async function call(path, fields) {
  // Leaves from the fixed, whitelisted IP when the egress proxy is configured.
  const res = await egressFetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, Sign: sign(fields) }),
    signal: AbortSignal.timeout(20000),
  });

  // LipaPay answers HTTP 200 even for hard failures; the real code is in the
  // body. Never branch on res.ok here.
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error(`LipaPay returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    err.code = 'LIPAPAY_BAD_RESPONSE';
    throw err;
  }
  if (!json || Array.isArray(json) || typeof json.Succeeded !== 'boolean') {
    throw Object.assign(new Error('Invalid LipaPay response envelope.'), { code: 'LIPAPAY_BAD_RESPONSE' });
  }
  return { json, text };
}

/** Turn LipaPay's polymorphic Errors field into one readable line. */
function errorText(errors) {
  if (!errors) return 'Unknown error';
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) return errors.join('; ');
  // Validation failures arrive as { Field: ["message", ...] }, sometimes in Chinese.
  return Object.entries(errors)
    .map(([field, msgs]) => `${field}: ${[].concat(msgs).join(', ')}`)
    .join('; ');
}

function fail(json, fallbackCode) {
  const err = new Error(`LipaPay: ${errorText(json.Errors)}`);
  err.code = json.StatusCode === 403 && /IP address|whitelist|not authorized/i.test(errorText(json.Errors))
    ? 'LIPAPAY_IP_NOT_WHITELISTED' : fallbackCode;
  err.statusCode = json.StatusCode;
  return err;
}

/**
 * Push a payment prompt to the customer's phone.
 *
 * Asynchronous: a success here means LipaPay accepted the order, not that any
 * money moved. The customer still has to approve on their handset, and the
 * outcome arrives via callback (or getPaymentStatus).
 *
 * @returns {{ transactionId: string, platformRef: string, status: 'PENDING' }}
 *          transactionId is our own OutTradeNo — that is the key orderquery
 *          takes, so it doubles as the payment reference we persist.
 */
export async function requestToPay({ amountUGX, phone, orderId, note, network }) {
  const fields = collectionFields({ merchantId: MCH_ID, notifyUrl: NOTIFY_URL,
    amountUGX, phone, orderId, note, network });
  // Airtel name matching is order-sensitive. Resolve the registered wallet
  // name instead of forwarding a delivery name or the bypass sentinel.
  if (network === 'airtel') {
    const quote = await billEnquiry({ phone: fields.TraderID, amountUGX, channel: 2 });
    fields.TraderFullName = airtelWalletName(quote);
    fields.TimeStamp = Math.floor(Date.now() / 1000);
  }
  let response;
  try {
    response = await call('/api/pay/unifiedorder', fields);
  } catch (error) {
    // The response may have been lost AFTER the gateway accepted the debit.
    // Keep this reference available for reconciliation; never submit a new one.
    error.code ||= 'LIPAPAY_TRANSPORT_ERROR';
    error.paymentUncertain = true;
    error.referenceId = orderId;
    throw error;
  }
  const { json, text } = response;
  if (!json.Succeeded) {
    const error = fail(json, 'LIPAPAY_REQUEST_FAILED');
    if ([500, 502].includes(Number(json.StatusCode)) || /duplicate/i.test(errorText(json.Errors))) {
      error.paymentUncertain = true;
      error.referenceId = orderId;
    }
    throw error;
  }

  const receipt = json.Data;
  const receiptFields = ['OutTradeNo', 'TransactionId', 'ActualPaymentAmount',
    'ActualCollectAmount', 'PayerCharge', 'PayeeCharge', 'ChannelCharge'];
  if (!receipt || receipt.OutTradeNo !== orderId || !receipt.TransactionId
    || !verifySignature(text, receiptFields)) {
    throw Object.assign(new Error('Payment acceptance could not be verified; query the existing reference.'), {
      code: 'LIPAPAY_BAD_RECEIPT', paymentUncertain: true, referenceId: orderId,
    });
  }

  // Acceptance is not proof that a handset prompt was delivered. Keep the
  // platform reference so a missing prompt can be traced without logging the
  // phone number, signature, key, or complete request/response payload.
  console.info('[PAYMENT ACCEPTED]', {
    orderId, network, channel: fields.Channel, amountUGX: fields.Amount / 100,
    platformRef: json.Data?.TransactionId || null,
    statusCode: json.StatusCode,
  });

  return {
    transactionId: orderId,
    platformRef: json.Data?.TransactionId || null,
    status: 'PENDING',
  };
}

/** A failed or incomplete name enquiry must not initiate a collection. */
export function airtelWalletName(quote) {
  const name = typeof quote.data?.FullName === 'string' ? quote.data.FullName.trim() : '';
  if (!quote.ok || !name || name.length > 50 || name === 'NONEEDMATCHNAMES') {
    throw Object.assign(new Error('Airtel wallet name could not be verified before collection.'), {
      code: 'LIPAPAY_WALLET_LOOKUP_FAILED',
    });
  }
  return name;
}

/**
 * Prepaid bill enquiry: looks up the wallet holder's name and the fee for an
 * amount. Charges nothing, but it is IP-gated like unifiedorder, so it is the
 * safe way to prove our fixed IP is whitelisted.
 *
 * @returns {{ ok: boolean, statusCode: number, errors: string|null, data: object|null }}
 */
export async function billEnquiry({ phone, amountUGX = MIN_AMOUNT_UGX, channel = 0, traderId }) {
  const { json } = await call('/api/pay/bill', {
    Version: 'v1.0',
    MchID: Number(MCH_ID),
    TimeStamp: Math.floor(Date.now() / 1000),
    Channel: channel, // 0 auto-detects MTN vs Airtel from the prefix
    TransactionType: 1,
    // traderId: the number exactly as given, for the admin check's format test.
    TraderID: traderId || normalizeMsisdn(phone),
    Amount: Math.round(amountUGX) * 100,
  });
  return {
    ok: Boolean(json.Succeeded),
    statusCode: json.StatusCode,
    errors: json.Succeeded ? null : errorText(json.Errors),
    data: json.Data || null,
  };
}

/**
 * Authoritative status for an order.
 *
 * @param outTradeNo our order id, as passed to requestToPay
 * @returns {{ status: string, reason: string|null }} — status is authoritative;
 *          reason is the provider's informational PayMessage.
 */
export async function getPaymentResult(outTradeNo) {
  const { json, text } = await call('/api/pay/orderquery', {
    Version: 'v1.0',
    MchID: Number(MCH_ID),
    TimeStamp: Math.floor(Date.now() / 1000),
    OutTradeNo: outTradeNo,
  });

  if (!json.Succeeded) {
    // An order we submitted moments ago may not be queryable yet. Documented
    // as 404 but actually 400 "OutTradeNo does not exist!" — treat either as
    // still-pending rather than a failure, or we would mark a live payment dead.
    const msg = errorText(json.Errors);
    if (json.StatusCode === 404 || /does not exist/i.test(msg)) {
      return { status: 'PENDING', reason: null };
    }
    throw fail(json, 'LIPAPAY_STATUS_FAILED');
  }

  if (!verifySignature(text, RESULT_FIELDS)) {
    const err = new Error('LipaPay order status failed signature verification.');
    err.code = 'LIPAPAY_BAD_SIGNATURE';
    throw err;
  }

  // Do not discard PayMessage: polling or reconciliation may settle the
  // payment before the callback, or the callback may never arrive.
  if (json.Data?.OutTradeNo !== outTradeNo) {
    throw Object.assign(new Error('Payment status belongs to a different reference.'), { code: 'LIPAPAY_WRONG_REFERENCE' });
  }
  return {
    status: payStatusToString(json.Data?.PayStatus),
    reason: json.Data?.PayMessage || null,
  };
}

/** Compatibility for callbacks and callers that only need the status. */
export async function getPaymentStatus(outTradeNo) {
  return (await getPaymentResult(outTradeNo)).status;
}

/**
 * LipaPay's own record of an order, including PayMessage: the reason a payment
 * failed ("user cancelled", "insufficient balance", "timeout", ...). For the
 * admin check only; customers see our own wording.
 */
export async function orderDetails(outTradeNo) {
  const { json } = await call('/api/pay/orderquery', {
    Version: 'v1.0',
    MchID: Number(MCH_ID),
    TimeStamp: Math.floor(Date.now() / 1000),
    OutTradeNo: outTradeNo,
  });
  if (!json.Succeeded) return { found: false, statusCode: json.StatusCode, errors: errorText(json.Errors) };
  const d = json.Data || {};
  return {
    found: true,
    status: payStatusToString(d.PayStatus),
    message: d.PayMessage || null,
    payTime: d.PayTime || null,
    // Requests send cents; LipaPay's order record reports whole shillings.
    amountUGX: d.Amount != null ? Number(d.Amount) : null,
    transactionId: d.TransactionId || null,
  };
}

/**
 * The merchant account's balance and its transactions for a date range
 * (yyyyMMdd, at most 3 days). Read-only; for the admin check.
 */
export async function accountSummary({ startDay, endDay }) {
  const stamp = () => Math.floor(Date.now() / 1000);
  const bal = await call('/api/pay/balance', { Version: 'v1.0', MchID: Number(MCH_ID), TimeStamp: stamp() });
  const stmt = await call('/api/pay/statement', {
    Version: 'v1.0', MchID: Number(MCH_ID), TimeStamp: stamp(), StartTime: startDay, EndTime: endDay,
  });
  return {
    balance: bal.json.Succeeded ? bal.json.Data?.Balance : { error: errorText(bal.json.Errors) },
    items: stmt.json.Succeeded ? stmt.json.Data?.Items || [] : { error: errorText(stmt.json.Errors) },
  };
}

/** PayStatus enum → our status vocabulary. */
export function payStatusToString(payStatus) {
  switch (Number(payStatus)) {
    case 1: return 'SUCCESSFUL';
    case 2: return 'FAILED';
    case 0: return 'PENDING';
    default: return 'UNKNOWN';
  }
}

/**
 * Local 10-digit form with leading zero (0750000000), which is what the
 * platform's examples use. Accepts +256…/256… and normalises back down.
 */
function normalizeMsisdn(phone) {
  return normalizeWallet(phone);
}
