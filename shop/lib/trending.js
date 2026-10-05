import { aliexpressDS } from './aliexpress.js';
import { CATEGORIES } from './categories.js';
import { mapPool, memoAsync } from './pool.js';

/**
 * "Best picks": what AliExpress itself ranks as best selling, not a keyword we
 * chose. Searching for the words "best seller" returns listings that merely
 * contain those words, so the real ranking has to come from AliExpress.
 *
 *   1. AliExpress's curated recommendation feeds (best sellers / hot products),
 *      discovered at runtime because the feeds on offer depend on the account.
 *   2. If no feed is usable, the top results of each shop category — each is a
 *      high-traffic product-type search AliExpress already ranks by relevance
 *      and popularity — interleaved so no single category dominates.
 */

const FEED_NAMES_TTL_MS = 6 * 60 * 60 * 1000;
const FEED_RETRY_AFTER_MS = 60 * 60 * 1000;
// Best sellers first, then anything that signals popularity.
const FEED_PREFERENCE = [/best.?sell/i, /hot/i, /top/i, /popular|trend|recommend/i];

// AliExpress's own best-seller lists for mainstream shopping categories, mixed
// so the home page shows a spread of what sells rather than one niche. Matched
// against the account's real feed names, because AliExpress renames feeds and a
// feed missing from this list is simply skipped. TRENDING_FEEDS (comma
// separated, exact names) overrides it.
const PREFERRED_FEEDS = [
  /^DS_ConsumerElectronics_bestsellers$/i,
  /^DS_Home&Kitchen_bestsellers$/i,
  /^DS_Beauty_bestsellers$/i,
  /^DS_Sports&Outdoors_bestsellers$/i,
  /^DS_Automobile&Accessories_bestsellers$/i,
  /i69_FullCategory_TopSellers/i,
  /^phones&accessories_ZA topsellers/i,
  /^home appliances_ZA topsellers/i,
];
// The feeds are curated lists, not ordered by popularity, so the best sellers
// are picked out of them by units sold. Poorly reviewed or barely selling items
// don't qualify; a missing figure is not held against an item, it just ranks last.
const MIN_RATING = 4.4;
const MIN_SOLD = 50;
const FEED_FETCH_SIZE = 50;
const PER_FEED_KEPT = 30;
const POOL_TTL_MS = 20 * 60 * 1000;
const MIN_POOL = 8;

let pool = { at: 0, items: [], feeds: 0 };

const qualifies = (p) =>
  !(p.rating != null && p.rating < MIN_RATING) && !(p.sold != null && p.sold < MIN_SOLD);

let feedNames = { at: 0, names: [] };
let feedUnavailableUntil = 0;

async function discoverFeeds() {
  if (feedNames.names.length && Date.now() - feedNames.at < FEED_NAMES_TTL_MS) return feedNames.names;
  const names = await aliexpressDS.getFeedNames();
  console.log('[trending] feeds available to this account:', JSON.stringify(names));
  feedNames = { at: Date.now(), names };
  return names;
}

/** Candidate feeds, most promising first. An explicit TRENDING_FEED_NAME always wins. */
export function rankFeeds(names, preferred = process.env.TRENDING_FEED_NAME) {
  const ranked = [];
  if (preferred) ranked.push(preferred);
  for (const re of FEED_PREFERENCE) {
    for (const n of names) if (re.test(n) && !ranked.includes(n)) ranked.push(n);
  }
  for (const n of names) if (!ranked.includes(n)) ranked.push(n);
  return ranked.slice(0, 3);
}

/** The feeds to blend: the preferred mix if the account has it, else the best single feed. */
export function chooseFeeds(names, override = process.env.TRENDING_FEEDS) {
  const custom = String(override || '').split(',').map((n) => n.trim()).filter(Boolean);
  const mix = custom.length
    ? custom.filter((n) => names.includes(n))
    : PREFERRED_FEEDS.map((re) => names.find((n) => re.test(n))).filter(Boolean);
  return mix.length >= 2 ? mix : rankFeeds(names).slice(0, 2);
}

/**
 * The ranked pool of best sellers: for each category feed take the items that
 * qualify, order them by units sold, then interleave the feeds so every page is
 * a spread of categories rather than one feed's whole run. Built once and
 * reused, since every page of every visitor reads from it.
 */
async function buildPool() {
  if (pool.items.length && Date.now() - pool.at < POOL_TTL_MS) return pool;

  const names = await discoverFeeds();
  const feeds = chooseFeeds(names);
  if (!feeds.length) return null;

  const lists = await Promise.all(
    feeds.map((feedName) =>
      aliexpressDS
        .recommendFeed({ feedName, page: 1, pageSize: FEED_FETCH_SIZE })
        .then((l) =>
          l
            .filter(qualifies)
            .sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0))
            .slice(0, PER_FEED_KEPT)
        )
        .catch((e) => {
          console.warn(`[trending] feed "${feedName}" failed:`, e.message);
          return [];
        })
    )
  );

  const items = interleave(lists, Infinity);
  if (items.length < MIN_POOL) {
    console.warn('[trending] feeds gave too few qualifying products:', items.length, JSON.stringify(feeds));
    return null;
  }
  pool = { at: Date.now(), items, feeds: feeds.length };
  return pool;
}

async function fromFeed({ page, pageSize }) {
  if (Date.now() < feedUnavailableUntil) return null;
  try {
    const ready = await buildPool();
    if (!ready) return null;
    const from = (page - 1) * pageSize;
    return { source: `feeds:${ready.feeds}`, products: ready.items.slice(from, from + pageSize) };
  } catch (e) {
    // Most likely the account lacks access to feeds. Don't hammer a method
    // that will keep failing — fall back and look again later.
    console.warn('[trending] feed unavailable:', e.code, e.message);
    feedUnavailableUntil = Date.now() + FEED_RETRY_AFTER_MS;
  }
  return null;
}

/** Round-robin across lists so the mix stays varied, dropping repeats. */
export function interleave(lists, limit) {
  const seen = new Set();
  const out = [];
  for (let i = 0; out.length < limit; i++) {
    let any = false;
    for (const list of lists) {
      const item = list[i];
      if (!item) continue;
      any = true;
      if (seen.has(item.id) || !item.id || !item.image || !(item.priceUSD > 0)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) break;
    }
    if (!any) break;
  }
  return out;
}

async function fromCategories({ page, pageSize }) {
  const perCategory = Math.max(3, Math.ceil(pageSize / CATEGORIES.length) + 1);
  const lists = await Promise.all(
    CATEGORIES.map((c) =>
      aliexpressDS
        .searchProducts({ keyword: c.keyword, page, pageSize: perCategory })
        .catch((e) => {
          console.warn(`[trending] "${c.keyword}" failed:`, e.message);
          return [];
        })
    )
  );
  return { source: 'categories', products: interleave(lists, pageSize) };
}

const SKU_LOOKUP_CONCURRENCY = 6;
const OPTION_TTL_MS = 6 * 60 * 60 * 1000;

// Which option to list a product at, remembered so the same best sellers aren't
// looked up again on every page and every cold start of this server.
const cheapestOption = memoAsync(
  async (productId) => {
    const d = await aliexpressDS.getProduct({ productId });
    // Unknown stock counts as available, matching what checkout allows.
    const inStock = (v) => v.stock == null || v.stock === '' || Number(v.stock) > 0;
    const options = d.variants.filter((v) => v.skuId && v.priceUSD > 0 && inStock(v));
    return options.sort((a, b) => a.priceUSD - b.priceUSD)[0] || null;
  },
  { ttlMs: OPTION_TTL_MS }
);

/**
 * Feed items arrive without a SKU, and without one there is no shipping quote
 * and nothing specific to put in a cart. Look up the cheapest option in stock
 * and price the listing at that option, so the price shown, the shipping quoted
 * and the item added to the cart are all the same thing.
 */
export async function attachSkus(products) {
  const out = await mapPool(products, SKU_LOOKUP_CONCURRENCY, async (p) => {
    if (p.skuId) return p;
    try {
      const best = await cheapestOption(p.id);
      if (!best) return null; // nothing purchasable
      const original = p.originalUSD && p.originalUSD > best.priceUSD ? p.originalUSD : null;
      return {
        ...p,
        skuId: best.skuId,
        priceUSD: best.priceUSD,
        originalUSD: original,
        discountPct: original ? Math.round((1 - best.priceUSD / original) * 100) : null,
      };
    } catch (e) {
      console.warn(`[trending] could not resolve an option for ${p.id}:`, e.message);
      return p;
    }
  });
  return out.filter(Boolean);
}

/** @returns {Promise<{ source: string, products: object[] }>} */
export async function getTrending({ page = 1, pageSize = 20 } = {}) {
  const found = (await fromFeed({ page, pageSize })) || (await fromCategories({ page, pageSize }));
  return { ...found, products: await attachSkus(found.products) };
}

