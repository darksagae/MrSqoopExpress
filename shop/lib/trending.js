import { aliexpressDS } from './aliexpress.js';
import { CATEGORIES } from './categories.js';

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
const MIN_FEED_RESULTS = 4;

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

async function fromFeed({ page, pageSize }) {
  if (Date.now() < feedUnavailableUntil) return null;
  try {
    const names = await discoverFeeds();
    for (const feedName of rankFeeds(names)) {
      const products = await aliexpressDS.recommendFeed({ feedName, page, pageSize });
      if (products.length >= MIN_FEED_RESULTS) return { source: `feed:${feedName}`, products };
    }
    console.warn('[trending] no feed returned enough products; names:', JSON.stringify(names));
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

/** @returns {Promise<{ source: string, products: object[] }>} */
export async function getTrending({ page = 1, pageSize = 20 } = {}) {
  return (await fromFeed({ page, pageSize })) || (await fromCategories({ page, pageSize }));
}
