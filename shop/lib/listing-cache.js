// Public product data only; never cart, account or payment information.
export function createListingCache({ storage = () => sessionStorage, fetcher = (...args) => fetch(...args), now = Date.now } = {}) {
  const memory = new Map();
  const inflight = new Map();
  const storeKey = 'mse:public-listings:v1';
  const maxAge = 24 * 60 * 60 * 1000;
  const freshFor = 5 * 60 * 1000;
  function read(url) {
    let entry = memory.get(url);
    if (!entry) {
      try { entry = JSON.parse(storage().getItem(storeKey) || '{}')[url]; } catch { /* storage blocked */ }
    }
    if (!entry || now() - entry.at > maxAge || !entry.data?.products?.length) return null;
    return { ...entry, fresh: now() - entry.at < freshFor };
  }
  function write(url, data) {
    if (!data?.products?.length) return;
    memory.set(url, { at: now(), data });
    if (memory.size > 40) memory.delete(memory.keys().next().value);
    try {
      const entries = { ...JSON.parse(storage().getItem(storeKey) || '{}'), [url]: { at: now(), data } };
      const recent = Object.entries(entries).filter(([, e]) => now() - e.at < maxAge)
        .sort((a, b) => b[1].at - a[1].at).slice(0, 40);
      storage().setItem(storeKey, JSON.stringify(Object.fromEntries(recent)));
    } catch { /* private browsing or storage full: memory still works */ }
  }
  function load(url) {
    if (inflight.has(url)) return inflight.get(url);
    const promise = (async () => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.products)) {
        throw Object.assign(new Error(data.error || 'Could not load products'), { detail: data });
      }
      write(url, data);
      return data;
    })().finally(() => inflight.delete(url));
    inflight.set(url, promise);
    return promise;
  }
  return { read, write, load };
}
export const listings = createListingCache();
