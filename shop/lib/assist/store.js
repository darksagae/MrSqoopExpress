/**
 * Reads the shop through its own public API, so Alexa quotes exactly the
 * prices, shipping and order status a customer sees on the website.
 */

async function get(base, path) {
  const res = await fetch(base + path, { headers: { accept: 'application/json' }, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function searchProducts(base, keyword, limit = 12) {
  const q = new URLSearchParams({ keyword, limit: String(limit) });
  const { ok, body } = await get(base, `/api/products?${q}`);
  if (!ok) throw new Error(body.error || 'Product search failed');
  return body.products || [];
}

export async function getProduct(base, id) {
  const { ok, status, body } = await get(base, `/api/products/${encodeURIComponent(id)}`);
  if (status === 404) return null;
  if (!ok) throw new Error(body.error || 'Product lookup failed');
  return body.product || null;
}

export async function getTrending(base, limit = 5) {
  const { ok, body } = await get(base, `/api/trending?limit=${limit}`);
  if (!ok) throw new Error(body.error || 'Could not load deals');
  return body.products || [];
}

export async function trackOrder(base, orderId, phone) {
  const q = new URLSearchParams({ orderId, phone });
  const { ok, status, body } = await get(base, `/api/track?${q}`);
  if (status === 404) return null;
  if (!ok) throw new Error(body.error || 'Order lookup failed');
  return body.order || null;
}
