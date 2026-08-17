import crypto from 'crypto';

/**
 * MTN Mobile Money — Collection API (request-to-pay).
 *
 * Pushes a payment prompt to the customer's MTN phone; they approve with their
 * MoMo PIN and the money lands in your MoMo collection account. The order then
 * sits as "pending" for you to manually forward to AliExpress.
 *
 * Credentials come from the MTN MoMo Developer Portal (momodeveloper.mtn.com):
 *   MTN_SUBSCRIPTION_KEY  — "Ocp-Apim-Subscription-Key" for the Collection product
 *   MTN_API_USER          — API User UUID you create
 *   MTN_API_KEY           — API Key generated for that API User
 *   MTN_TARGET_ENV        — 'sandbox' or 'mtnuganda' (production)
 *   MTN_BASE_URL          — https://sandbox.momodeveloper.mtn.com (sandbox)
 *                           or the production host MTN gives you
 */

const SUBSCRIPTION_KEY = process.env.MTN_SUBSCRIPTION_KEY || process.env.MTN_API_KEY;
const API_USER = process.env.MTN_API_USER;
const API_KEY = process.env.MTN_API_SECRET; // the generated API Key
const TARGET_ENV = process.env.MTN_TARGET_ENV || 'sandbox';
const BASE_URL = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
// MTN rejects non-https callback hosts, and the host must match the
// providerCallbackHost registered when the API user was created.
const CALLBACK_URL = process.env.MTN_CALLBACK_URL;

export function isMtnConfigured() {
  return Boolean(SUBSCRIPTION_KEY && API_USER && API_KEY);
}

export function mtnMissing() {
  const m = [];
  if (!SUBSCRIPTION_KEY) m.push('MTN_SUBSCRIPTION_KEY');
  if (!API_USER) m.push('MTN_API_USER');
  if (!API_KEY) m.push('MTN_API_SECRET (API Key)');
  return m;
}

/** OAuth2 bearer token for the Collection product. */
async function getToken() {
  const basic = Buffer.from(`${API_USER}:${API_KEY}`).toString('base64');
  const res = await fetch(`${BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }
  if (!res.ok || !json.access_token) {
    const err = new Error(`MTN token request failed (${res.status}): ${text.slice(0, 200)}`);
    err.code = 'MTN_AUTH_FAILED';
    throw err;
  }
  return json.access_token;
}

/**
 * Request a payment from a customer's MTN number.
 * @returns {{ referenceId: string, status: 'PENDING' }}
 */
export async function requestToPay({ amountUGX, phone, orderId, note }) {
  const token = await getToken();
  const referenceId = crypto.randomUUID();

  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': TARGET_ENV,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
      // Without this MTN has nowhere to report the outcome. It fires the
      // callback exactly once and never retries, so getPaymentStatus() remains
      // the authoritative check either way.
      ...(CALLBACK_URL ? { 'X-Callback-Url': CALLBACK_URL } : {}),
    },
    body: JSON.stringify({
      amount: String(amountUGX),
      currency: TARGET_ENV === 'sandbox' ? 'EUR' : 'UGX', // sandbox only supports EUR
      externalId: String(orderId),
      payer: { partyIdType: 'MSISDN', partyId: normalizeMsisdn(phone) },
      payerMessage: note || 'MrSqoopExpress order',
      payeeNote: `Order ${orderId}`,
    }),
  });

  // 202 Accepted = prompt sent to the customer's phone.
  if (res.status !== 202) {
    const text = await res.text();
    const err = new Error(`MTN request-to-pay failed (${res.status}): ${text.slice(0, 200)}`);
    err.code = 'MTN_REQUEST_FAILED';
    throw err;
  }

  return { referenceId, status: 'PENDING' };
}

/** Poll the status of a request-to-pay. */
export async function getPaymentStatus(referenceId) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': TARGET_ENV,
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
    },
  });
  const json = await res.json().catch(() => ({}));
  return json.status || 'UNKNOWN'; // SUCCESSFUL | PENDING | FAILED
}

/**
 * Payer MSISDN in international format without '+'.
 *
 * Production coerces to Uganda (256XXXXXXXXX). Sandbox deliberately does not:
 * MTN's documented test matrix drives every failure path off Swedish-format
 * numbers (46733123450 = Failed, …451 = Rejected, …452 = Expired, …455 =
 * NotFound, …460 = InvalidCurrency; any other number succeeds). Prefixing
 * those with 256 would silently turn each one into a success and make the
 * failure paths impossible to test.
 */
function normalizeMsisdn(phone) {
  const p = String(phone).replace(/[^0-9]/g, '');
  if (TARGET_ENV === 'sandbox') return p;
  if (p.startsWith('0')) return '256' + p.slice(1);
  if (!p.startsWith('256')) return '256' + p;
  return p;
}
