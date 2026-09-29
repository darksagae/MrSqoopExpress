import crypto from 'crypto';

/**
 * Bank card payments via CyberSource Secure Acceptance Hosted Checkout
 * (acquired by Absa Bank Uganda).
 *
 * The customer is sent to CyberSource's hosted page with a form POST whose
 * fields are HMAC-SHA256 signed with our secret key; card details never touch
 * our servers. CyberSource then POSTs the outcome back to the receipt URL
 * configured on the profile, signed the same way.
 */

const ENDPOINTS = {
  test: 'https://testsecureacceptance.cybersource.com/pay',
  live: 'https://secureacceptance.cybersource.com/pay',
};

// Exactly the set agreed with Absa on the transactor sign-off form.
const SIGNED_FIELDS = [
  'access_key',
  'profile_id',
  'transaction_uuid',
  'signed_field_names',
  'unsigned_field_names',
  'signed_date_time',
  'locale',
  'transaction_type',
  'reference_number',
  'amount',
  'currency',
];

const REQUIRED_ENV = ['CYBERSOURCE_PROFILE_ID', 'CYBERSOURCE_ACCESS_KEY', 'CYBERSOURCE_SECRET_KEY'];

export function cardMissing() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

export function isCardConfigured() {
  return cardMissing().length === 0;
}

// Defaults to the test endpoint so a missing flag can never take real money.
export function cardEndpoint() {
  return process.env.CYBERSOURCE_ENV === 'live' ? ENDPOINTS.live : ENDPOINTS.test;
}

function sign(fields, signedFieldNames) {
  const data = signedFieldNames.map((name) => `${name}=${fields[name] ?? ''}`).join(',');
  return crypto
    .createHmac('sha256', process.env.CYBERSOURCE_SECRET_KEY)
    .update(data, 'utf8')
    .digest('base64');
}

// CyberSource wants UTC with no milliseconds: 2026-09-29T10:15:00Z
function signedDateTime() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build the signed form fields for one payment.
 * @returns {{ endpoint: string, fields: Record<string,string>, transactionUuid: string }}
 */
export function buildPaymentRequest({ orderId, amountUGX }) {
  const transactionUuid = crypto.randomUUID();
  const fields = {
    access_key: process.env.CYBERSOURCE_ACCESS_KEY,
    profile_id: process.env.CYBERSOURCE_PROFILE_ID,
    transaction_uuid: transactionUuid,
    signed_field_names: SIGNED_FIELDS.join(','),
    unsigned_field_names: '',
    signed_date_time: signedDateTime(),
    locale: 'en',
    transaction_type: 'sale',
    reference_number: orderId,
    // UGX has no minor unit.
    amount: String(Math.round(amountUGX)),
    currency: 'UGX',
  };
  fields.signature = sign(fields, SIGNED_FIELDS);
  return { endpoint: cardEndpoint(), fields, transactionUuid };
}

/** True when a CyberSource response's signature matches its signed fields. */
export function verifyResponse(fields) {
  const names = String(fields.signed_field_names || '').split(',').filter(Boolean);
  if (!names.length || !fields.signature || !process.env.CYBERSOURCE_SECRET_KEY) return false;
  const expected = Buffer.from(sign(fields, names));
  const given = Buffer.from(String(fields.signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * Map a response decision onto our payment states. REVIEW means CyberSource
 * held the payment for manual fraud review, so it is neither paid nor failed.
 */
export function outcomeFor(decision) {
  switch (String(decision || '').toUpperCase()) {
    case 'ACCEPT':
      return 'SUCCESSFUL';
    case 'REVIEW':
      return 'PENDING';
    default:
      return 'FAILED'; // DECLINE, ERROR, CANCEL
  }
}
