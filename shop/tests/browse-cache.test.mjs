import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowseCache, BROWSE_FRESH_MS, BROWSE_MAX_AGE_MS } from '../lib/browse-cache.js';
import { createListingCache } from '../lib/listing-cache.js';

const args = { keyword: 'women dress', page: 1, limit: 10 };
const products = [{ id: 'dress', title: 'Dress', priceUSD: 12 }];
function fixture({ age = 0, saved = true, failure = false, empty = false, lease = true } = {}) {
  const now = 2 * BROWSE_MAX_AGE_MS;
  let entry = saved ? { products, updatedAt: now - age } : null;
  let calls = 0;
  const tasks = [];
  const get = createBrowseCache({
    read: async () => entry, write: async (_, value) => { entry = value; },
    claim: async () => lease, schedule: (task) => tasks.push(task), now: () => now, warn: () => {},
    fetchProducts: async () => { calls++; if (failure) throw new Error('Rate limited'); return empty ? [] : [{ id: 'new' }]; },
  });
  return { get, tasks, entry: () => entry, calls: () => calls };
}
test('fresh durable listings survive a new server instance without supplier calls', async () => {
  const f = fixture();
  assert.deepEqual((await f.get(args)).products, products);
  assert.equal(f.calls(), 0);
  assert.equal(f.tasks.length, 0);
});
test('stale products return before the scheduled refresh and failures preserve them', async () => {
  const f = fixture({ age: BROWSE_FRESH_MS + 1, failure: true });
  assert.equal((await f.get(args)).stale, true);
  assert.equal(f.calls(), 0);
  await f.tasks[0]();
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.entry().products, products);
});
test('a successful background refresh replaces the old copy', async () => {
  const f = fixture({ age: BROWSE_FRESH_MS + 1 });
  await f.get(args); await f.tasks[0]();
  assert.deepEqual((await f.get(args)).products, [{ id: 'new' }]);
});
test('a refresh lease held by another server prevents a second supplier request', async () => {
  const f = fixture({ age: BROWSE_FRESH_MS + 1, lease: false });
  await f.get(args); await f.tasks[0](); assert.equal(f.calls(), 0);
});
test('concurrent cold requests share one supplier search', async () => {
  const f = fixture({ saved: false });
  await Promise.all([f.get(args), f.get(args)]);
  assert.equal(f.calls(), 1);
});
test('empty or rate-limited refreshes never replace successful products', async () => {
  const f = fixture({ age: BROWSE_FRESH_MS + 1, empty: true });
  await f.get(args); await f.tasks[0]();
  assert.deepEqual(f.entry().products, products);
});
test('products older than seven days are not served on a failed cold lookup', async () => {
  const f = fixture({ age: BROWSE_MAX_AGE_MS + 1, failure: true });
  await assert.rejects(f.get(args), /Rate limited/);
});
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
}
test('browser results survive remounts and failed refreshes', async () => {
  const saved = storage(); let now = 0;
  const one = createListingCache({ storage: () => saved, now: () => now });
  one.write('/women', { products }); now = 6 * 60 * 1000;
  const two = createListingCache({ storage: () => saved, now: () => now,
    fetcher: async () => ({ ok: false, json: async () => ({ error: 'Busy' }) }) });
  assert.equal(two.read('/women').fresh, false);
  await assert.rejects(two.load('/women'), /Busy/);
  assert.deepEqual(two.read('/women').data.products, products);
  assert.equal(two.read('/men'), null);
});
test('duplicate browser requests share one bounded fetch and do not cache empty results', async () => {
  let calls = 0;
  const cache = createListingCache({ storage: () => storage(), fetcher: async (_, init) => {
    calls++; assert.ok(init.signal); return { ok: true, json: async () => ({ products: [] }) };
  } });
  await Promise.all([cache.load('/test'), cache.load('/test')]);
  assert.equal(calls, 1); assert.equal(cache.read('/test'), null);
});
test('storage failures do not prevent in-memory browsing', async () => {
  const cache = createListingCache({ storage: () => { throw Error('Blocked'); } });
  cache.write('/test', { products }); assert.deepEqual(cache.read('/test').data.products, products);
});
