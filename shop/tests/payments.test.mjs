import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Deliberately fake credentials. Every provider request in this suite is mocked.
process.env.LIPAPAY_MCH_ID = '2';
process.env.LIPAPAY_PRIVATE_KEY = 'offline-test-key';
process.env.LIPAPAY_NOTIFY_URL = 'https://example.test/callback';
delete process.env.EGRESS_PROXY_URL;
const lipapay = await import('../lib/payments/lipapay.js');
const { readPaymentResult } = await import('../lib/payments/result.js');
const { explainFailure } = await import('../lib/payments/failure.js');

function signedResult({ status = 2, message = 'Transaction not found', signature = null } = {}) {
  const values = {
    PayStatus: String(status), PayTime: '2026-10-20 12:00:00',
    OutTradeNo: 'OFFLINE-001', TransactionId: 'platform-reference',
    Amount: '500.00', ActualPaymentAmount: '500.00', ActualCollectAmount: '500.00',
    PayerCharge: '0.00', PayeeCharge: '0.00',
  };
  const base = Object.entries(values).map(([k,v]) => `${k}=${v}`).join('&');
  const sign = signature ?? crypto.createHash('md5').update(base + '&privateKey=offline-test-key').digest('hex');
  const fields = Object.entries(values).map(([k,v]) =>
    `${JSON.stringify(k)}:${['PayTime','OutTradeNo','TransactionId'].includes(k) ? JSON.stringify(v) : v}`);
  fields.push(`"PayMessage":${JSON.stringify(message)}`, `"Sign":"${sign}"`);
  return `{"Succeeded":true,"StatusCode":200,"Data":{${fields.join(',')}}}`;
}

function reply(t, body) {
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
}

test('Airtel request uses channel 2, local phone and cents for all supported input formats', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({url, body:JSON.parse(init.body)});
    return Response.json({Succeeded:true, StatusCode:200, Data:{TransactionId:'platform-reference'}});
  });
  t.mock.method(console, 'info', () => {});
  for (const phone of ['0750000000', '750000000', '+256 750 000 000']) {
    const result = await lipapay.requestToPay({amountUGX:500, phone, orderId:'OFFLINE-001', network:'airtel'});
    const {Sign, ...fields} = calls.at(-1).body;
    assert.equal(calls.at(-1).url, 'https://pay.lipapayug.com/api/pay/unifiedorder');
    assert.deepEqual(fields, {
      Version:'v1.0', MchID:2, TimeStamp:fields.TimeStamp, Channel:2,
      OutTradeNo:'OFFLINE-001', Amount:50000, TransactionType:1,
      TraderID:'0750000000', TraderFullName:'NONEEDMATCHNAMES',
      Description:'MrSqoopExpress OFFLINE-001', NotifyUrl:'https://example.test/callback',
    });
    const base = Object.entries(fields).map(([k,v]) => `${k}=${v}`).join('&');
    assert.equal(Sign, crypto.createHash('md5').update(base+'&privateKey=offline-test-key').digest('hex'));
    assert.equal(result.status, 'PENDING'); // Never infer handset delivery or payment.
  }
});

test('invalid phone or network cannot submit a payment', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {throw Error('must not submit');});
  for (const input of [{phone:'123',network:'airtel'}, {phone:'0750000000',network:'invalid'}]) {
    await assert.rejects(lipapay.requestToPay({amountUGX:500,orderId:'OFFLINE-001',...input}), {code:'LIPAPAY_INVALID_WALLET'});
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('HTTP 200 with provider rejection is not accepted', async (t) => {
  reply(t, JSON.stringify({Succeeded:false, StatusCode:502, Errors:'Channel unavailable'}));
  await assert.rejects(lipapay.requestToPay({amountUGX:500,phone:'0750000000',orderId:'OFFLINE-001',network:'airtel'}), {code:'LIPAPAY_REQUEST_FAILED'});
});

test('signed failure keeps the actual Airtel message, including raw decimal signature fields', async (t) => {
  reply(t, signedResult());
  const outcome = await readPaymentResult(lipapay, 'OFFLINE-001');
  assert.deepEqual(outcome, {status:'FAILED',failureReason:'Transaction not found'});
});

test('successful payment never stores a failure reason', async (t) => {
  reply(t, signedResult({status:1,message:'SUCCESSFUL'}));
  assert.deepEqual(await readPaymentResult(lipapay,'OFFLINE-001'), {status:'SUCCESSFUL',failureReason:null});
});

test('unknown merchant order stays pending rather than declaring payment failed', async (t) => {
  reply(t, JSON.stringify({Succeeded:false,StatusCode:400,Errors:'OutTradeNo does not exist!'}));
  assert.equal(await lipapay.getPaymentStatus('OFFLINE-001'), 'PENDING');
});

test('invalid signature cannot settle payment', async (t) => {
  reply(t, signedResult({status:1,signature:'0'.repeat(32)}));
  await assert.rejects(readPaymentResult(lipapay,'OFFLINE-001'), {code:'LIPAPAY_BAD_SIGNATURE'});
});

test('direct MTN and Airtel string providers remain supported', async () => {
  const provider = {getPaymentStatus:async () => 'successful'};
  assert.deepEqual(await readPaymentResult(provider,'direct-ref'), {status:'SUCCESSFUL',failureReason:null});
});

test('missing Airtel transaction is not blamed on an unanswered PIN prompt', () => {
  for (const reason of ['Transaction not found', 'DP00800001025']) {
    assert.match(explainFailure('airtel', reason), /could not find the payment request/);
    assert.doesNotMatch(explainFailure('airtel', reason), /approval in time/);
  }
  assert.match(explainFailure('mtn','TIMEOUT'), /approval in time/);
});
