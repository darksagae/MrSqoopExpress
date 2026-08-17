#!/usr/bin/env node
/**
 * Creates a sandbox API User + API Key, following MTN's documented Provisioning
 * API flow:
 *
 *   POST /v1_0/apiuser                 (X-Reference-Id = a UUID you choose) -> 201
 *   POST /v1_0/apiuser/{id}/apikey                                          -> 201 {apiKey}
 *   GET  /v1_0/apiuser/{id}                                                 -> 200 (verify)
 *   POST /collection/token/            (Basic base64(id:apiKey))            -> 200 {access_token}
 *
 * The reference ID you pass becomes the API User's ID. Sandbox only — in
 * production the pair is issued through the Account/Partner Portal instead.
 *
 * Usage:
 *   MTN_SUBSCRIPTION_KEY=xxx node scripts/mtn-provision.mjs [callback-host]
 *
 * The callback host is a bare domain (no scheme, no path) and must be https-
 * capable, since MTN refuses non-https callback hosts.
 */

import { randomUUID } from 'node:crypto';

const BASE = process.env.MTN_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const SUB_KEY = process.env.MTN_SUBSCRIPTION_KEY;
const CALLBACK_HOST = process.argv[2] || process.env.MTN_CALLBACK_HOST || 'example.com';

if (!SUB_KEY) {
  console.error('MTN_SUBSCRIPTION_KEY is not set.');
  console.error('Find it under Profile on momodeveloper.mtn.com — each product');
  console.error('subscription has its own Primary/Secondary key.');
  process.exit(1);
}

// MTN's docs show a bare domain here, but implementations in the wild pass a
// full URL and it is accepted. Take either and reduce it to the host.
const callbackHost = CALLBACK_HOST.includes('://')
  ? new URL(CALLBACK_HOST).host
  : CALLBACK_HOST.split('/')[0];

if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(callbackHost)) {
  console.error(`Could not read a hostname from: ${CALLBACK_HOST}`);
  console.error('Example: ali.mrsqoopexpress.com');
  process.exit(1);
}

const headers = { 'Ocp-Apim-Subscription-Key': SUB_KEY };

async function step(label, fn) {
  process.stdout.write(`${label} ... `);
  try {
    const result = await fn();
    console.log('ok');
    return result;
  } catch (err) {
    console.log('FAILED');
    console.error(`\n  ${err.message}\n`);
    if (err.status === 401) {
      console.error('  401 means this key is not valid for the provisioning API.');
      console.error('  Subscription keys are issued per product, and /v1_0/apiuser');
      console.error('  belongs to the Sandbox Provisioning product — MTN\'s docs are');
      console.error('  explicit: "Merchants/Agents/Partners/Testers needs to use the');
      console.error('  Sandbox Provisioning Collection and generate the apiuser and');
      console.error('  apikey". A Collection Widget key will not work here.');
      console.error('');
      console.error('  Subscribe to Sandbox Provisioning on momodeveloper.mtn.com and');
      console.error('  use that product\'s Primary Key.');
    }
    process.exit(1);
  }
}

async function call(method, path, { body, auth } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...headers,
      ...(auth ? { Authorization: auth } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : { 'Content-Length': '0' }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text || '(empty body)'}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

const referenceId = randomUUID();

console.log(`Base URL      : ${BASE}`);
console.log(`Callback host : ${callbackHost}`);
console.log(`API User ID   : ${referenceId}\n`);

await step('1. Create API user', () =>
  fetch(`${BASE}/v1_0/apiuser`, {
    method: 'POST',
    headers: { ...headers, 'X-Reference-Id': referenceId, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerCallbackHost: callbackHost }),
  }).then(async (res) => {
    if (res.status !== 201) {
      const err = new Error(`POST /v1_0/apiuser -> ${res.status} ${await res.text()}`);
      err.status = res.status;
      throw err;
    }
  })
);

const { apiKey } = await step('2. Create API key', () =>
  call('POST', `/v1_0/apiuser/${referenceId}/apikey`)
);

const details = await step('3. Verify API user', () =>
  call('GET', `/v1_0/apiuser/${referenceId}`)
);

const basic = Buffer.from(`${referenceId}:${apiKey}`).toString('base64');
const token = await step('4. Exchange for access token', () =>
  call('POST', '/collection/token/', { auth: `Basic ${basic}` })
);

console.log(`\nVerified target environment: ${details.targetEnvironment}`);
console.log(`Token expires in: ${token.expires_in}s\n`);
// These names must match what lib/payments/mtn.js reads. In particular the
// generated API Key goes in MTN_API_SECRET (MTN_API_KEY is treated there as a
// fallback for the *subscription* key), and it is MTN_TARGET_ENV, not
// MTN_TARGET_ENVIRONMENT.
console.log('Add these to shop/.env.local:\n');
console.log(`MTN_SUBSCRIPTION_KEY=${SUB_KEY}`);
console.log(`MTN_API_USER=${referenceId}`);
console.log(`MTN_API_SECRET=${apiKey}`);
console.log(`MTN_TARGET_ENV=${details.targetEnvironment}`);
console.log(`MTN_BASE_URL=${BASE}`);
console.log(`MTN_CALLBACK_URL=https://${callbackHost}/api/webhooks/payments/mtn`);
console.log('\nStore the API key now — MTN will not show it again.');
