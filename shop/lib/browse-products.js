import { after } from 'next/server';
import { aliexpressDS } from './aliexpress.js';
import { getSql, isDbConfigured } from './db.js';
import { createBrowseCache } from './browse-cache.js';

let ready;
async function database() {
  if (!isDbConfigured()) return null;
  const sql = getSql();
  ready ??= sql`CREATE TABLE IF NOT EXISTS catalog_browse_cache (
    cache_key TEXT PRIMARY KEY, products JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    refresh_after TIMESTAMPTZ NOT NULL DEFAULT now()
  )`.catch((error) => { ready = null; throw error; });
  await ready;
  return sql;
}

export const getBrowseProducts = createBrowseCache({
  schedule: (task) => after(task),
  fetchProducts: ({ keyword, page, limit }) => aliexpressDS.searchProducts({ keyword, page, pageSize: limit, currency: 'USD' }),
  read: async (key) => {
    const sql = await database();
    if (!sql) return null;
    const [row] = await sql`SELECT products, updated_at FROM catalog_browse_cache WHERE cache_key=${key}`;
    return row ? { products: row.products, updatedAt: new Date(row.updated_at).getTime() } : null;
  },
  write: async (key, entry) => {
    const sql = await database();
    if (!sql) return;
    await sql`INSERT INTO catalog_browse_cache (cache_key, products, updated_at)
      VALUES (${key}, ${JSON.stringify(entry.products)}::jsonb, ${new Date(entry.updatedAt).toISOString()}::timestamptz)
      ON CONFLICT (cache_key) DO UPDATE SET products=EXCLUDED.products, updated_at=EXCLUDED.updated_at, refresh_after=now()`;
  },
  claim: async (key) => {
    const sql = await database();
    if (!sql) return true;
    const rows = await sql`UPDATE catalog_browse_cache SET refresh_after=now() + interval '60 seconds'
      WHERE cache_key=${key} AND refresh_after <= now() RETURNING cache_key`;
    return rows.length > 0;
  },
});

// Category icons reuse listing photos; they never launch sixteen extra searches.
export async function cachedCategoryImages(categories) {
  const sql = await database();
  if (!sql) return [];
  const keys = categories.map(({ keyword }) => JSON.stringify([keyword.trim().toLowerCase(), 1, 10]));
  const rows = await sql`SELECT cache_key, products FROM catalog_browse_cache
    WHERE cache_key = ANY(${keys}::text[]) AND updated_at > now() - interval '7 days'`;
  const byKey = new Map(rows.map((row) => [row.cache_key, row.products]));
  return categories.map((cat, index) => ({ ...cat, image: byKey.get(keys[index])?.find((p) => p.image)?.image || null }));
}
