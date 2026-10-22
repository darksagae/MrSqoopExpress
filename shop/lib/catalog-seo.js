import { getSql, isDbConfigured } from './db.js';

export async function sitemapProducts() {
  if (!isDbConfigured()) return [];
  const sql = getSql();
  return sql`SELECT product->>'id' AS id, max(updated_at) AS updated_at
    FROM catalog_browse_cache CROSS JOIN LATERAL jsonb_array_elements(products) AS product
    WHERE updated_at > now() - interval '7 days' AND product->>'id' ~ '^[0-9]+$'
    GROUP BY product->>'id' ORDER BY max(updated_at) DESC LIMIT 49000`;
}

export async function cachedCategory(keyword) {
  if (!isDbConfigured()) return null;
  const sql = getSql();
  const key = JSON.stringify([keyword.trim().toLowerCase(), 1, 10]);
  const [row] = await sql`SELECT products FROM catalog_browse_cache
    WHERE cache_key=${key} AND updated_at > now() - interval '7 days'`;
  return row?.products?.length ? row.products : null;
}

export async function cachedProduct(id) {
  if (!isDbConfigured() || !/^\d+$/.test(id)) return null;
  const sql = getSql();
  const [row] = await sql`SELECT product FROM catalog_browse_cache
    CROSS JOIN LATERAL jsonb_array_elements(products) AS product
    WHERE product->>'id'=${id} AND updated_at > now() - interval '7 days'
    ORDER BY updated_at DESC LIMIT 1`;
  return row?.product || null;
}
