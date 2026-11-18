import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Exercise the real settings functions with an in-memory database boundary.
const source = fs.readFileSync(new URL('../lib/settings.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export /g, '');
function fixture() {
  const assets = new Map([['promo-banner', { content_type: 'image/jpeg', data: Buffer.from('legacy'), updated_at: new Date(0) }]]);
  const settings = new Map();
  const sql = async (parts, ...args) => {
    const query = parts.join('?');
    if (query.includes('CREATE TABLE')) return [];
    if (query.includes('INSERT INTO shop_assets')) assets.set(args[0], { content_type: args[1], data: args[2], updated_at: new Date() });
    else if (query.includes('DELETE FROM shop_assets')) assets.delete(args[0]);
    else if (query.includes('SELECT key, updated_at')) return [...assets].map(([key, value]) => ({ key, updated_at: value.updated_at }));
    else if (query.includes('SELECT content_type')) return assets.has(args[0]) ? [assets.get(args[0])] : [];
    else if (query.includes('INSERT INTO shop_settings')) settings.set(args[0], JSON.parse(args[1]));
    else if (query.includes('SELECT key, value')) return [...settings].map(([key, value]) => ({ key, value }));
    else throw new Error(`Unexpected query: ${query}`);
    return [];
  };
  const api = new Function('crypto', 'getSql', 'isDbConfigured', `${source}\nreturn { validate, savePromoImage, removePromoImage, getPromoImages, getPromoImage, saveSettings };`)(crypto, () => sql, () => true);
  return { ...api, assets };
}
const image = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
test('adding many flyers preserves the original and every previous upload', async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) assert.equal((await f.savePromoImage(image)).ok, true);
  const banners = await f.getPromoImages();
  assert.equal(banners.length, 31);
  assert.equal(new Set(banners.map(b => b.id)).size, 31);
  assert.equal(banners[0].id, 'promo-banner');
  assert.ok(banners.every(b => b.url.startsWith('/api/promo-banner?id=')));
  assert.equal((await f.getPromoImage(banners[1].id)).content_type, 'image/jpeg');
  assert.equal((await f.removePromoImage(banners[1].id)).banners.length, 30);
  assert.ok(await f.getPromoImage('promo-banner'));
});
test('invalid image and asset IDs cannot write or read unrelated assets', async () => {
  const f = fixture();
  assert.equal((await f.savePromoImage('data:image/jpeg;base64,aGVsbG8=')).ok, false);
  assert.equal((await f.removePromoImage('other-asset')).ok, false);
  assert.equal(await f.getPromoImage('other-asset'), null);
  assert.equal(f.assets.size, 1);
});
test('rotation time validates and persists without altering promotion terms', async () => {
  const f = fixture();
  for (const value of [0, -1, 1.5, 'invalid', 86401]) assert.equal(f.validate({ promoRotationSeconds: value }).errors.length, 1);
  assert.equal((await f.saveSettings({ promoRotationSeconds: 12 })).settings.promoRotationSeconds, 12);
  assert.equal((await f.saveSettings({ rate: 3800 })).settings.promoRotationSeconds, 12);
});
