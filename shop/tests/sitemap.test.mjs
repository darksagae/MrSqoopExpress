import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES, categorySlug } from '../lib/categories.js';
const source = fs.readFileSync(new URL('../app/sitemap.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export const revalidate', 'const revalidate')
  .replace('export default async function sitemap','async function sitemap');
test('sitemap includes all sixteen canonical categories and cached product URLs', async () => {
  const sitemap = new Function('CATEGORIES','categorySlug','sitemapProducts',`${source}\nreturn sitemap;`)(CATEGORIES, categorySlug,
    async () => [{ id: '100123', updated_at: '2026-10-22T00:00:00Z' }]);
  const entries = await sitemap();
  assert.equal(entries.length, 21);
  assert.equal(entries.filter(e=>e.url.includes('/category/')).length,16);
  assert.ok(entries.some(e=>e.url.endsWith('/category/phones-tablets')));
  assert.ok(entries.some(e=>e.url.endsWith('/product/100123')));
  assert.equal(new Set(entries.map(e=>e.url)).size,entries.length);
  assert.equal(entries.some(e=>e.url.includes('?q=')),false);
});
test('category slugs are unique and safe URL paths', () => {
  const slugs=CATEGORIES.map(categorySlug);
  assert.equal(new Set(slugs).size,16);
  assert.ok(slugs.every(slug=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)));
});
