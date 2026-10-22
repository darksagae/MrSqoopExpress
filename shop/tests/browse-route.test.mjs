import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the actual route without contacting the supplier or database.
const routeSource = fs.readFileSync(new URL('../app/api/products/route.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '').replace('export async function GET', 'async function GET');
const priceSource = fs.readFileSync(new URL('../lib/catalog.js', import.meta.url), 'utf8')
  .split('export function priceProducts')[1];
const priceProducts = new Function('itemUGX', 'shipUGX', 'handlingFee', 'DELIVERY_PROMISE',
  `const round2=n=>Math.round((Number(n)||0)*100)/100;return function priceProducts${priceSource}`)(
    (n) => n * 3700, (n) => n * 3700, () => 500, {});

test('browse preview makes no per-product detail or shipping requests and cannot add unverified options', async () => {
  let calls = 0;
  const unexpected = () => { throw new Error('Expensive per-product lookup was called'); };
  const deps = {
    NextResponse: Response, loadSettings: async () => {}, currentSettings: () => ({}),
    aliexpressDS: { hasCredentials: () => true, searchProducts: unexpected },
    getBrowseProducts: async (args) => {
      calls++; assert.equal(args.limit, 10); assert.equal(args.page, 1);
      return { products: [{ id: 'test', skuId: 'unverified', priceUSD: 10 }], updatedAt: 1, stale: true };
    },
    priceProducts, attachSkus: unexpected, quoteFreightForAll: unexpected,
    CUSTOMER_DESTINATION: {}, CUSTOMER_DESTINATION_LABEL: '', handlingPercent: () => 0,
  };
  const GET = new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;\n${routeSource}\nreturn GET;`)(deps);
  const result = await GET(new Request('https://shop.test/api/products?keyword=women&limit=10&preview=1'));
  const data = await result.json();
  assert.equal(result.status, 200); assert.equal(calls, 1);
  assert.equal(data.products[0].priceUGX, 37000);
  assert.equal(data.products[0].skuId, null);
  assert.equal(data.products[0].shipping.known, false);
  assert.equal(data.products[0].shipping.free, false);
  assert.equal(data.products[0].totalUGX, null);
  assert.equal(data.stale, true);
});
