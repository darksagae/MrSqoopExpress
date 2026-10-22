// Store only successful supplier listings. Refreshes never clear a good copy.
export const BROWSE_FRESH_MS = 30 * 60 * 1000;
export const BROWSE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createBrowseCache({ read, write, claim, schedule, fetchProducts, now = Date.now, warn = console.warn }) {
  const inflight = new Map();
  const memory = new Map();
  async function refresh(key, args) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      const products = await fetchProducts(args);
      if (!Array.isArray(products)) throw new Error('Invalid product listing');
      if (!products.length) {
        if (args.page === 1) throw new Error('Supplier returned an empty listing');
        return { products: [], updatedAt: now() };
      }
      const entry = { products, updatedAt: now() };
      try { await write(key, entry); } catch { warn('[browse] cache write unavailable'); }
      if (memory.size >= 100) memory.delete(memory.keys().next().value);
      memory.set(key, entry);
      return entry;
    })().finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }
  return async (args) => {
    const key = JSON.stringify([args.keyword.trim().toLowerCase(), args.page, args.limit]);
    let entry = memory.get(key);
    if (!entry || now() - entry.updatedAt >= BROWSE_FRESH_MS) {
      try { entry = await read(key) || entry; } catch { warn('[browse] cache read unavailable'); }
    }
    if (entry?.products?.length && now() - entry.updatedAt < BROWSE_MAX_AGE_MS) {
      const stale = now() - entry.updatedAt >= BROWSE_FRESH_MS;
      if (stale) schedule(async () => {
        try {
          // A database lease stops different Vercel instances refreshing together.
          if (await claim(key)) await refresh(key, args);
        } catch { warn('[browse] keeping last successful listing'); }
      });
      return { ...entry, stale };
    }
    return { ...await refresh(key, args), stale: false };
  };
}
