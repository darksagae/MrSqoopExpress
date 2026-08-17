/**
 * Airtel Money — Collection API (USSD push).
 *
 * Pushes a payment prompt to the customer's Airtel phone; they approve with
 * their Airtel Money PIN and the money lands in your Airtel merchant account.
 *
 * Credentials come from the Airtel Africa Developer Portal (developers.airtel.africa):
 *   AIRTEL_CLIENT_ID      — OAuth2 client id
 *   AIRTEL_CLIENT_SECRET  — OAuth2 client secret
 *   AIRTEL_BASE_URL       — https://openapiuat.airtel.africa (UAT/sandbox)
 *                           or https://openapi.airtel.africa (production)
 *   AIRTEL_COUNTRY        — 'UG'
 *   AIRTEL_CURRENCY       — 'UGX'
 */

const CLIENT_ID = process.env.AIRTEL_CLIENT_ID || process.env.AIRTEL_API_KEY;
const CLIENT_SECRET = process.env.AIRTEL_CLIENT_SECRET || process.env.AIRTEL_API_SECRET;
const BASE_URL = process.env.AIRTEL_BASE_URL || 'https://openapiuat.airtel.africa';
const COUNTRY = process.env.AIRTEL_COUNTRY || 'UG';
const CURRENCY = process.env.AIRTEL_CURRENCY || 'UGX';

export function isAirtelConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function airtelMissing() {
  const m = [];
  if (!CLIENT_ID) m.push('AIRTEL_CLIENT_ID');
  if (!CLIENT_SECRET) m.push('AIRTEL_CLIENT_SECRET');
  return m;
}

/** OAuth2 client-credentials bearer token. */
async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }
  if (!res.ok || !json.access_token) {
    const err = new Error(`Airtel token request failed (${res.status}): ${text.slice(0, 200)}`);
    err.code = 'AIRTEL_AUTH_FAILED';
    throw err;
  }
  return json.access_token;
}

/**
 * Request a payment (USSD push) from a customer's Airtel number.
 * @returns {{ transactionId: string, status: 'PENDING' }}
 */
export async function requestToPay({ amountUGX, phone, orderId }) {
  const token = await getToken();
  const msisdn = normalizeMsisdn(phone);

  const res = await fetch(`${BASE_URL}/merchant/v1/payments/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Country': COUNTRY,
      'X-Currency': CURRENCY,
    },
    body: JSON.stringify({
      reference: String(orderId),
      subscriber: { country: COUNTRY, currency: CURRENCY, msisdn },
      transaction: { amount: Number(amountUGX), country: COUNTRY, currency: CURRENCY, id: String(orderId) },
    }),
  });

  const json = await res.json().catch(() => ({}));
  const ok = res.ok && json?.status?.success !== false;
  if (!ok) {
    const err = new Error(`Airtel payment failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
    err.code = 'AIRTEL_REQUEST_FAILED';
    throw err;
  }

  return { transactionId: json?.data?.transaction?.id || String(orderId), status: 'PENDING' };
}

/** Check the status of an Airtel transaction. */
export async function getPaymentStatus(transactionId) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}/standard/v1/payments/${transactionId}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Country': COUNTRY, 'X-Currency': CURRENCY },
  });
  const json = await res.json().catch(() => ({}));
  // TS: transaction success | TF: failed | TIP: in progress
  const code = json?.data?.transaction?.status;
  if (code === 'TS') return 'SUCCESSFUL';
  if (code === 'TF') return 'FAILED';
  return 'PENDING';
}

/** Uganda MSISDN Airtel expects: local 9-digit without country code or leading 0. */
function normalizeMsisdn(phone) {
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('256')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  return p;
}
