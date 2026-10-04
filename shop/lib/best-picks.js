import { loadSettings } from './settings.js';
import { getTrending } from './trending.js';
import { quoteFreightForAll, priceProducts } from './catalog.js';

/**
 * One page of best picks, fully priced and shipping-quoted, with anything no
 * seller will ship to Uganda left out. Used by both /api/trending and the home
 * page, so what is pre-rendered into the page is exactly what the API returns.
 */
export async function getBestPicks({ page = 1, limit = 20 } = {}) {
  await loadSettings();
  // A little extra, because undeliverable products are dropped afterwards.
  const { source, products } = await getTrending({ page, pageSize: Math.ceil(limit * 1.4) });
  const freights = await quoteFreightForAll(products);
  const priced = priceProducts(products, freights)
    .filter((p) => p.shipping.deliverable !== false)
    .slice(0, limit);
  return { source, products: priced, hasMore: products.length > 0 };
}
