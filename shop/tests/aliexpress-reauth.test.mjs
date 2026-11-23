import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source = fs.readFileSync(new URL('../lib/aliexpress.js', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '').replace(/export /g, '');
function fixture(row, due = true) {
  let refreshClaims = 0;
  const Client = new Function('crypto', 'readTokens', 'needsRefresh', 'claimRefresh', 'SOURCING',
    `${source}\nreturn AliExpressDS;`)(crypto, async () => row, () => due,
    async () => { refreshClaims++; throw new Error('Unexpected refresh'); }, {countryCode:'AE'});
  return { client: new Client(), claims: () => refreshClaims };
}
test('rejected grants fail before another refresh is attempted', async () => {
  const f = fixture({access_token:'old', needs_reauth:true});
  await assert.rejects(f.client.getAccessToken(), {code:'REAUTH_REQUIRED'});
  await assert.rejects(f.client.forceRefresh(), {code:'REAUTH_REQUIRED'});
  assert.equal(f.claims(), 0);
});
test('a successful reconnection clears the guard and allows the new token', async () => {
  const row = {access_token:'old',needs_reauth:true};
  const f = fixture(row);
  await assert.rejects(f.client.getAccessToken(), {code:'REAUTH_REQUIRED'});
  Object.assign(row, {access_token:'new',needs_reauth:false});
  const valid = fixture(row, false);
  assert.equal(await valid.client.getAccessToken(), 'new');
});

test('authorization migrates the retired callback without changing app identity', () => {
  const previous = process.env.ALIEXPRESS_CALLBACK_URL;
  try {
    process.env.ALIEXPRESS_CALLBACK_URL = 'https://ali.mrsqoopexpress.com/api/auth/aliexpress/callback';
    const {client} = fixture({});
    client.appKey = 'test-app';
    const url = new URL(client.getAuthorizeUrl('test-state'));
    assert.equal(url.searchParams.get('redirect_uri'), 'https://www.mrsqoopexpress.com/api/auth/aliexpress/callback');
    assert.equal(url.searchParams.get('client_id'), 'test-app');
    assert.equal(url.searchParams.get('state'), 'test-state');
    process.env.ALIEXPRESS_CALLBACK_URL = 'https://www.mrsqoopexpress.com/api/auth/aliexpress/callback';
    assert.equal(new URL(client.getAuthorizeUrl()).searchParams.get('redirect_uri'), process.env.ALIEXPRESS_CALLBACK_URL);
  } finally {
    if (previous === undefined) delete process.env.ALIEXPRESS_CALLBACK_URL;
    else process.env.ALIEXPRESS_CALLBACK_URL = previous;
  }
});
