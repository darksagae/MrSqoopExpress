import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { quoteFreightForAll, priceProducts } from '@/lib/catalog';
import { attachSkus } from '@/lib/trending';
import { getBrowseProducts } from '@/lib/browse-products';
import {
  CUSTOMER_DESTINATION,
  CUSTOMER_DESTINATION_LABEL,
  handlingPercent,
} from '@/lib/shipping-destination';
import { loadSettings, currentSettings } from '@/lib/settings';

// Prices are shown exactly as AliExpress lists them, so there is no markup by
// default. The variable stays so a margin can be reintroduced deliberately
// rather than by forgetting to remove one.

// The same searches repeat constantly (every category tile, every popular term),
// and each uncached one costs a search plus a shipping quote per product. Serve
// repeats from the CDN, and serve a stale copy instantly while refreshing it.
const SEARCH_CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

// Filtering removes results, so more are fetched than the caller asked for.
const OVERFETCH = 1.6;
const MAX_PAGE_SIZE = 50;

/**
 * GET /api/products?keyword=...&page=1&limit=20&shipping=0
 *
 * Real AliExpress products priced exactly as AliExpress charges them for our
 * warehouse, each with its own shipping cost and the handling fee shown as its
 * own separate charge. Customers are told it is all for delivery to Uganda.
 *
 * Shipping is reported per product rather than folded into the price because
 * AliExpress allocates it per product: some items ship to Uganda free and
 * others do not, and averaging that into one number would misprice both.
 *
 * Products no seller will ship to the warehouse are dropped, not listed as
 * unavailable — the shop only sells what it can actually deliver.
 */
export async function GET(request) {
  await loadSettings();
  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('keyword') || '').trim().slice(0, 200);
  const page = Math.min(100, Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1));
  const limit = Math.min(30, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  // Escape hatch for callers that only need titles and prices quickly.
  const withShipping = searchParams.get('shipping') !== '0';
  // Undeliverable products are dropped by default. deliverable=0 keeps them, so
  // the admin tooling can still see what was filtered and why.
  const dropUndeliverable = searchParams.get('deliverable') !== '0';

  if (!keyword) {
    return NextResponse.json(
      { error: 'A "keyword" query parameter is required to search products.' },
      { status: 400 }
    );
  }

  // App credentials are a config question and answerable up front. Whether we
  // hold a live token is not — that is resolved (and renewed) inside the call.
  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json(
      {
        error: 'Products are not available right now.',
      },
      { status: 503 }
    );
  }

  try {
    if (searchParams.get('preview') === '1') {
      // Browsing needs one search, not a detail and freight call per item.
      // Product pages and checkout confirm options, shipping and availability.
      const listing = await getBrowseProducts({ keyword, page, limit });
      const products = priceProducts(listing.products, []).map((product) => ({ ...product, skuId: null }));
      return NextResponse.json({ success: true, preview: true, keyword, products,
        count: products.length, hasMore: products.length > 0,
        updatedAt: new Date(listing.updatedAt).toISOString(), stale: listing.stale,
      }, { headers: { 'Cache-Control': products.length
        ? 'public, s-maxage=60, stale-while-revalidate=86400' : 'no-store' } });
    }
    // Ask for more than requested when filtering, otherwise a page of 20 can
    // arrive as 12 and the grid looks half-empty. Capped because every extra
    // product is another freight quote.
    const fetchSize = dropUndeliverable ? Math.min(MAX_PAGE_SIZE, Math.ceil(limit * OVERFETCH)) : limit;

    // Some categories (bulky goods, for example) lose most results to the
    // delivery filter, which left rows with two or three items. So one page the
    // shopper asks for can draw on up to PAGES_PER_REQUEST AliExpress pages,
    // stopping as soon as it has enough confirmed-deliverable products.
    const PAGES_PER_REQUEST = dropUndeliverable ? 3 : 1;
    const firstSearchPage = (page - 1) * PAGES_PER_REQUEST + 1;
    const seen = new Set();
    const priced = [];
    let shown = [];
    let hasMore = false;

    for (let i = 0; i < PAGES_PER_REQUEST; i++) {
      const batch = await aliexpressDS.searchProducts({
        keyword,
        page: firstSearchPage + i,
        pageSize: fetchSize,
        currency: 'USD',
      });
      hasMore = batch.length > 0;
      if (!batch.length) break;

      // Search results often carry no purchasable option, and shipping can only be
      // quoted for one. Without this step most results had "unknown" shipping and
      // were filtered out, leaving searches empty.
      const unseen = batch.filter((p) => !seen.has(p.id));
      batch.forEach((p) => seen.add(p.id));

      // Work through the page in chunks, stopping as soon as there are enough
      // confirmed-deliverable products, so a normal page costs about 2x its size
      // in AliExpress calls instead of 2x everything the search returned.
      for (let at = 0; at < unseen.length; at += Math.max(limit, 8)) {
        // Search results often carry no purchasable option, and shipping can only
        // be quoted for one. Without this step most results had "unknown"
        // shipping and were filtered out, leaving searches empty.
        const fresh = await attachSkus(unseen.slice(at, at + Math.max(limit, 8)));
        let freights = withShipping ? await quoteFreightForAll(fresh) : fresh.map(() => null);
        // Passing errors happen in bursts. Ask again, once, for the misses.
        const missed = withShipping ? freights.map((f, k) => (f ? -1 : k)).filter((k) => k >= 0 && fresh[k].skuId) : [];
        if (missed.length) {
          await new Promise((r) => setTimeout(r, 600));
          const again = await quoteFreightForAll(missed.map((k) => fresh[k]));
          freights = freights.slice();
          missed.forEach((k, n) => { freights[k] = again[n]; });
        }
        priced.push(...priceProducts(fresh, freights));

        // Only products AliExpress has confirmed it will deliver to the warehouse
        // are listed. A shipping lookup that failed or timed out counts as not
        // confirmed: showing those let items through that turn out to be
        // undeliverable once opened.
        shown = dropUndeliverable ? priced.filter((p) => p.shipping.deliverable === true) : priced;
        if (dropUndeliverable && shown.length >= limit) break;
      }
      if (shown.length >= limit) break;
    }
    shown = dropUndeliverable ? shown.slice(0, limit) : shown;

    // Nothing confirmed, but only because shipping lookups were being refused
    // (AliExpress rate limit) — say so, rather than claim nothing was found.
    if (dropUndeliverable && shown.length === 0 && priced.some((p) => p.shipping.deliverable === null)) {
      return NextResponse.json(
        { error: 'Search is busy right now.', message: 'Please try again in a few seconds.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json({
      success: true,
      count: shown.length,
      // Whether AliExpress likely has more results for the next page. AliExpress
      // caps how many items text.search returns per call independent of the
      // pageSize we ask for, so a page never actually fills fetchSize — the
      // only real "no more results" signal is an empty page. Everything short
      // of that (including a page thinned by shipping filtering) still means
      // there's more to try.
      hasMore,
      // How many the filter removed, so a thin page is explainable rather than
      // looking like the search simply found little.
      removedUndeliverable: priced.filter((p) => p.shipping.deliverable === false).length,
      unknownShippingCount: priced.filter((p) => p.shipping.deliverable === null).length,
      unknownNoOption: priced.filter((p) => p.shipping.deliverable === null && !p.skuId).length,
      keyword,
      markupPercentage: currentSettings().markupPercent,
      exchangeRate: currentSettings().rate,
      destination: { ...CUSTOMER_DESTINATION, label: CUSTOMER_DESTINATION_LABEL },
      handlingFeePercent: handlingPercent(),
      products: shown,
    }, {
      headers: {
        // Never let the CDN keep an empty or thin answer: a lookup that came back
        // short once (AliExpress hiccup, deploy in progress) would otherwise be
        // served as "No products found" to everyone for up to an hour.
        'Cache-Control': shown.length === 0
          ? 'no-store'
          : shown.length < Math.min(limit, 6)
            ? 'public, s-maxage=30'
            : SEARCH_CACHE,
      },
    });
  } catch (error) {
    console.error('Product search failed:', error.code, error.message);
    // Never pass the supplier's own error text to shoppers.
    const busy = error.code === 'RATE_LIMITED';
    return NextResponse.json(
      busy
        ? { error: 'Search is busy right now.', message: 'Please try again in a few seconds.', code: 'BUSY' }
        : { error: 'Could not load products right now.', message: 'Please try again in a moment.' },
      { status: busy ? 503 : 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
