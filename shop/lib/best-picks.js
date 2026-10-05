import { loadSettings } from './settings.js';
import { getTrending } from './trending.js';
import { quoteFreightForAll, priceProducts } from './catalog.js';

// The last good answer per page. AliExpress briefly bans the app when it is
// called too fast; during a ban every shipping lookup fails, nothing can be
// confirmed deliverable, and the page would come back empty. Serving the last
// good list (up to a few hours old) is far better than "nothing available".
const lastGood = new Map();
const LAST_GOOD_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * One page of best picks, fully priced and shipping-quoted, showing only what
 * AliExpress has confirmed it will deliver to Uganda. Used by both
 * /api/trending and the home page, so what is pre-rendered into the page is
 * exactly what the API returns.
 */
export async function getBestPicks({ page = 1, limit = 20 } = {}) {
  await loadSettings();
  const key = `${page}:${limit}`;

  try {
    // A little extra, because anything not confirmed deliverable to Uganda is
    // dropped afterwards (including shipping lookups that failed or timed out).
    const { source, products } = await getTrending({ page, pageSize: Math.ceil(limit * 1.4) });
    let freights = await quoteFreightForAll(products);

    // Lookups lost to a passing error get one more try.
    const missed = freights.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0 && products[i].skuId);
    if (missed.length) {
      await new Promise((r) => setTimeout(r, 600));
      const again = await quoteFreightForAll(missed.map((i) => products[i]));
      freights = freights.slice();
      missed.forEach((i, n) => { freights[i] = again[n]; });
    }

    const priced = priceProducts(products, freights)
      .filter((p) => p.shipping.deliverable === true)
      .slice(0, limit);
    const result = { source, products: priced, hasMore: products.length > 0 };

    if (priced.length) {
      lastGood.set(key, { at: Date.now(), result });
      return result;
    }
    const kept = lastGood.get(key);
    if (kept && Date.now() - kept.at < LAST_GOOD_TTL_MS) return kept.result;
    return result;
  } catch (e) {
    const kept = lastGood.get(key);
    if (kept && Date.now() - kept.at < LAST_GOOD_TTL_MS) return kept.result;
    throw e;
  }
}
