#!/usr/bin/env node
/**
 * LipaPay connectivity + credential check.
 *
 * Run this from a machine whose public IP is whitelisted with LipaPay.
 * /api/pay/bill and (almost certainly) /api/pay/unifiedorder are IP-gated —
 * they return 403 from anywhere else, including Vercel serverless functions,
 * whose egress IP is dynamic.
 *
 * Usage:
 *   export LIPAPAY_MCH_ID=1205036
 *   export LIPAPAY_PRIVATE_KEY=xxxxxxxx
 *
 *   node scripts/lipapay-check.mjs                     # read-only checks
 *   node scripts/lipapay-check.mjs --phone 07XXXXXXXX  # + name/fee lookup (IP-gated)
 *
 * Only with BOTH flags, and only if you accept a real charge:
 *   node scripts/lipapay-check.mjs --phone 07XXXXXXXX --charge --confirm
 *
 * There is no working sandbox (dev.pay.lipapayug.com returns 502), so --charge
 * moves REAL money from a REAL wallet. Minimum is 500 UGX.
 */

import crypto from 'node:crypto';

const BASE = process.env.LIPAPAY_BASE_URL || 'https://pay.lipapayug.com';
const MCH_ID = process.env.LIPAPAY_MCH_ID;
const KEY = process.env.LIPAPAY_PRIVATE_KEY;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};

if (!MCH_ID || !KEY) {
  console.error('Missing credentials.\n');
  console.error('  export LIPAPAY_MCH_ID=1205036');
  console.error('  export LIPAPAY_PRIVATE_KEY=<your key>\n');
  console.error('Never hard-code the key or commit it.');
  process.exit(1);
}

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;

/**
 * MD5 signature. `fields` must be insertion-ordered to match the endpoint's
 * parameter table in the API reference — NOT sorted alphabetically.
 */
function sign(fields) {
  const base = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto.createHash('md5').update(`${base}&privateKey=${KEY}`, 'utf8').digest('hex');
}

/**
 * Pull a field's value from raw response text rather than a parsed object.
 *
 * LipaPay signs the decimal representation it sent ("0.000000"), and
 * JSON.parse collapses that to the number 0, which re-serializes as "0" and
 * produces a different hash. Signature verification only works against the
 * literal characters on the wire.
 */
function rawField(text, key) {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*("[^"]*"|[^,}\\s]+)`));
  if (!m) return undefined;
  return m[1].startsWith('"') ? m[1].slice(1, -1) : m[1];
}

function verifyData(text, fieldOrder) {
  const expected = rawField(text, 'Sign');
  if (!expected) return null;
  const fields = {};
  for (const k of fieldOrder) {
    const v = rawField(text, k);
    if (v !== undefined && v !== '' && v !== 'null') fields[k] = v;
  }
  return { matches: sign(fields) === expected, expected, computed: sign(fields) };
}

async function call(path, fields) {
  const body = { ...fields, Sign: sign(fields) };
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { http: res.status, text, json };
}

const ts = () => Math.floor(Date.now() / 1000);

function report(label, { http, json }) {
  const code = json.StatusCode;
  const good = json.Succeeded === true;
  const mark = good ? ok('PASS') : bad('FAIL');
  console.log(`${mark}  ${label}`);
  console.log(`      HTTP ${http} · StatusCode ${code}`);
  if (!good && json.Errors) {
    console.log(`      Errors: ${JSON.stringify(json.Errors)}`);
  }
  return good;
}

console.log(`\nLipaPay check — ${BASE}`);
console.log(`Merchant ID: ${MCH_ID}\n`);

// Best-effort only: behind a proxy or NAT, an echo service can report a
// different address than the one LipaPay actually sees. The authoritative
// value comes from LipaPay's own 403 message further down.
try {
  const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(8000) });
  const { ip } = await r.json();
  console.log(`Public IP (per ipify): ${ip}\n`);
} catch {
  console.log(warn('Could not determine public IP (network restricted?)\n'));
}

// ---------------------------------------------------------------- read-only

console.log('── Read-only checks (work from any IP) ───────────────────────\n');

const bal = await call('/api/pay/balance', {
  Version: 'v1.0', MchID: Number(MCH_ID), TimeStamp: ts(),
});
if (report('Get Balance — credentials valid', bal)) {
  console.log(`      Balance: ${bal.json.Data?.Balance} UGX`);
  const v = verifyData(bal.text, ['Balance']);
  if (v) console.log(`      Response signature: ${v.matches ? ok('verified') : bad('MISMATCH')}`);
}
console.log();

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const stmt = await call('/api/pay/statement', {
  Version: 'v1.0', MchID: Number(MCH_ID), TimeStamp: ts(), StartTime: today, EndTime: today,
});
if (report('Statement — today', stmt)) {
  console.log(`      Transactions today: ${stmt.json.Data?.Items?.length ?? 0}`);
}
console.log();

// ------------------------------------------------------------ IP-gated

const phone = opt('--phone');

if (!phone) {
  console.log(warn('── Skipping IP-gated check — pass --phone 07XXXXXXXX to run it ──\n'));
} else {
  console.log('── IP-gated check (needs this IP whitelisted) ────────────────\n');

  const bill = await call('/api/pay/bill', {
    Version: 'v1.0',
    MchID: Number(MCH_ID),
    TimeStamp: ts(),
    Channel: 0,            // auto-detect MTN vs Airtel from the prefix
    TransactionType: 1,    // collection
    TraderID: phone,
    Amount: 50000,         // 500 UGX, in cents — preview only, charges nothing
  });

  const passed = report('Prepaid Bill Enquiry — name + fee lookup', bill);
  if (passed) {
    const d = bill.json.Data;
    console.log(`      Account name : ${d?.FullName}`);
    console.log(`      Amount       : ${d?.Amount} UGX`);
    console.log(`      Service fee  : ${d?.ServiceCharge} UGX (${d?.ServiceChargeRate}%)`);
    const v = verifyData(bill.text, [
      'TraderID', 'GivenName', 'FamilyName', 'FullName', 'Amount', 'ServiceCharge', 'ServiceChargeRate',
    ]);
    if (v) console.log(`      Response signature: ${v.matches ? ok('verified') : bad('MISMATCH')}`);
    console.log(`\n      ${ok('This IP is whitelisted.')} unifiedorder should work from here too.`);
  } else if (bill.json.StatusCode === 403) {
    // LipaPay echoes the address it saw — authoritative, unlike an echo service.
    const seen = String(bill.json.Errors || '').match(/\(([\d.]+)\)/)?.[1];
    console.log(`\n      ${bad('This IP is NOT whitelisted.')}`);
    if (seen) {
      console.log(`      LipaPay saw this request coming from: ${warn(seen)}`);
      console.log('      That is the address to give LipaPay support.');
    }
  }
  console.log();
}

// ------------------------------------------------------- real charge (opt-in)

if (flag('--charge')) {
  if (!phone) {
    console.error(bad('--charge requires --phone 07XXXXXXXX'));
    process.exit(1);
  }
  if (!flag('--confirm')) {
    console.log(warn('── --charge requested but --confirm missing ──────────────────\n'));
    console.log('  This would place a REAL collection of 500 UGX against');
    console.log(`  ${phone}. There is no working sandbox, so the money is real.`);
    console.log('\n  Re-run with --confirm if that is what you want.\n');
    process.exit(0);
  }

  console.log('── Live collection — REAL MONEY ──────────────────────────────\n');

  const outTradeNo = `TEST-${Date.now()}`;
  const notifyUrl = process.env.LIPAPAY_NOTIFY_URL
    || 'https://www.mrsqoopexpress.com/api/webhooks/payments/lipapay';

  console.log(`  OutTradeNo : ${outTradeNo}`);
  console.log(`  Amount     : 500 UGX (50000 cents)`);
  console.log(`  NotifyUrl  : ${notifyUrl}`);
  console.log('\n  Approve the prompt on the phone when it arrives.\n');

  const order = await call('/api/pay/unifiedorder', {
    Version: 'v1.0',
    MchID: Number(MCH_ID),
    TimeStamp: ts(),
    Channel: 0,
    OutTradeNo: outTradeNo,
    Amount: 50000,
    TransactionType: 1,
    TraderID: phone,
    TraderFullName: 'NONEEDMATCHNAMES',   // skip wallet name matching
    Description: 'MrSqoopExpress integration test',
    NotifyUrl: notifyUrl,
  });

  report('Unified Order — collection initiated', order);
  if (order.json.Succeeded) {
    console.log(`      TransactionId: ${order.json.Data?.TransactionId}`);
  }
  console.log();

  // The prompt is asynchronous — poll until the customer approves or it fails.
  console.log('  Polling order status (PayStatus 0=processing 1=success 2=failed)…\n');
  for (let i = 1; i <= 20; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const q = await call('/api/pay/orderquery', {
      Version: 'v1.0', MchID: Number(MCH_ID), TimeStamp: ts(), OutTradeNo: outTradeNo,
    });
    const st = q.json.Data?.PayStatus;
    const msg = q.json.Data?.PayMessage ?? q.json.Errors ?? '';
    console.log(`  [${String(i).padStart(2)}] PayStatus=${st ?? '-'} ${msg}`);
    if (st === 1) { console.log(`\n  ${ok('Payment successful.')}\n`); break; }
    if (st === 2) { console.log(`\n  ${bad('Payment failed.')}\n`); break; }
  }
}

console.log('Done.\n');
