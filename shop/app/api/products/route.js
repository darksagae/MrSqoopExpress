import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { itemUGX, shipUGX } from '@/lib/pricing';
import {
  CUSTOMER_DESTINATION,
  CUSTOMER_DESTINATION_LABEL,
  HANDLING_FEE_PERCENT,
  handlingFee,
} from '@/lib/shipping-destination';

// Prices are shown exactly as AliExpress lists them, so there is no markup by
// default. The variable stays so a margin can be reintroduced deliberately
// rather than by forgetting to remove one.
const MARKUP_PERCENTAGE = parseFloat(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE || '0');
const USD_TO_UGX_RATE = parseFloat(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE || '3700');

// AliExpress is asked for one freight quote per product, so the fan-out is
// capped: enough to keep a page of results fast, not so many that a single
// search burns through the API rate limit.
const FREIGHT_CONCURRENCY = 8;
// A slow freight lookup must not hold up the whole listing. Past this, the
// product is returned with shipping unknown rather than not returned at all.
const FREIGHT_TIMEOUT_MS = 6000;

// Filtering removes results, so more are fetched than the caller asked for.
const OVERFETCH = 1.6;
const MAX_PAGE_SIZE = 50;

/**
 * GET /api/products?keyword=...&page=1&limit=20&shipping=0
 *
 * Real AliExpress products priced exactly as AliExpress prices them for Uganda,
 * each with its own shipping cost to Uganda and the handling fee shown as its
 * own separate charge.
 *
 * Shipping is reported per product rather than folded into the price because
 * AliExpress allocates it per product: some items ship to Uganda free and
 * others do not, and averaging that into one number would misprice both.
 *
 * Products no seller will ship to Uganda are dropped, not listed as
 * unavailable — the shop only sells what it can actually deliver.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
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
        error: 'AliExpress Dropshipping API is not connected yet.',
        missing: aliexpressDS.missingConfig(),
        hint: 'Set the app key and secret from your approved AliExpress app.',
      },
      { status: 503 }
    );
  }

  try {
    // Ask for more than requested when filtering, otherwise a page of 20 can
    // arrive as 12 and the grid looks half-empty. Capped because every extra
    // product is another freight quote.
    const fetchSize = dropUndeliverable ? Math.min(MAX_PAGE_SIZE, Math.ceil(limit * OVERFETCH)) : limit;

    const products = await aliexpressDS.searchProducts({
      keyword,
      page,
      pageSize: fetchSize,
      countryCode: CUSTOMER_DESTINATION.countryCode,
      currency: 'USD',
    });

    const freights = withShipping ? await quoteFreightForAll(products) : products.map(() => null);

    const priced = products.map((p, i) => {
      const f = freights[i];

      // null means AliExpress never quoted this route — reported as unknown so
      // the UI can say "calculated at checkout" instead of implying free.
      const shipUSD = f?.freeShipping ? 0 : f?.shippingCostUSD ?? null;
      // Refused is a definite "no", not a missing answer.
      const refused = f?.quoted === true && f?.deliverable === false;

      const priceUGX = itemUGX(p.priceUSD);
      // Charged on the product price only. Shipping is a pass-through of what
      // AliExpress bills, so taking a percentage of it too would mean the fee
      // moved with the courier rather than with the goods.
      const handlingUGX = handlingFee(priceUGX);

      return {
        id: p.id,
        skuId: p.skuId,
        title: p.title,
        image: p.image,
        url: p.url,
        // The AliExpress figure itself, untouched.
        priceUSD: round2(p.priceUSD),
        priceUGX,
        handlingUGX,
        shipping: f
          ? {
              known: shipUSD != null,
              deliverable: !refused,
              reason: f.reason || null,
              free: Boolean(f.freeShipping),
              costUSD: shipUSD == null ? null : round2(shipUSD),
              costUGX: shipUSD == null ? null : shipUGX(shipUSD),
              company: f.company,
              minDays: f.minDays,
              maxDays: f.maxDays,
            }
          : { known: false, deliverable: null, reason: null, free: false, costUSD: null, costUGX: null },
        // Everything the customer pays: product + shipping + handling. Null
        // while shipping is unknown rather than understating the total.
        totalUGX:
          shipUSD == null
            ? null
            : priceUGX + shipUGX(shipUSD) + handlingUGX,
        currency: 'UGX',
      };
    });

    // Only a definite refusal from AliExpress removes a product. An unknown
    // quote means the lookup failed, not that the seller won't ship — dropping
    // those would hide perfectly sellable stock every time a request timed out.
    const shown = dropUndeliverable
      ? priced.filter((p) => p.shipping.deliverable !== false).slice(0, limit)
      : priced;

    return NextResponse.json({
      success: true,
      count: shown.length,
      // Whether AliExpress likely has more results for the next page. AliExpress
      // caps how many items text.search returns per call independent of the
      // pageSize we ask for, so a page never actually fills fetchSize — the
      // only real "no more results" signal is an empty page. Everything short
      // of that (including a page thinned by shipping filtering) still means
      // there's more to try.
      hasMore: products.length > 0,
      // How many the filter removed, so a thin page is explainable rather than
      // looking like the search simply found little.
      removedUndeliverable: priced.filter((p) => p.shipping.deliverable === false).length,
      unknownShippingCount: priced.filter((p) => p.shipping.deliverable === null).length,
      keyword,
      markupPercentage: MARKUP_PERCENTAGE,
      exchangeRate: USD_TO_UGX_RATE,
      destination: { ...CUSTOMER_DESTINATION, label: CUSTOMER_DESTINATION_LABEL },
      handlingFeePercent: HANDLING_FEE_PERCENT,
      products: shown,
    });
  } catch (error) {
    console.error('AliExpress product fetch failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch products from AliExpress.',
        code: error.code || 'UNKNOWN',
        message: error.message,
        ...(error.raw ? { rawSnippet: error.raw } : {}),
        ...(error.details ? { apiDetails: error.details } : {}),
      },
      { status: 502 }
    );
  }
}

/**
 * One freight quote per product, run in bounded batches.
 *
 * Every failure mode here degrades to null rather than throwing: a product with
 * an unknown shipping cost is still worth showing, but a listing that 502s
 * because one freight lookup timed out is not.
 */
async function quoteFreightForAll(products) {
  const results = new Array(products.length).fill(null);

  for (let start = 0; start < products.length; start += FREIGHT_CONCURRENCY) {
    const batch = products.slice(start, start + FREIGHT_CONCURRENCY);
    await Promise.all(
      batch.map(async (p, j) => {
        if (!p.skuId || !p.id) return; // no SKU, nothing to quote against
        try {
          results[start + j] = await withTimeout(
            aliexpressDS.queryFreight({ productId: p.id, skuId: p.skuId }),
            FREIGHT_TIMEOUT_MS
          );
        } catch (e) {
          console.warn(`Freight quote failed for ${p.id}:`, e.message);
        }
      })
    );
  }

  return results;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('freight quote timed out')), ms)),
  ]);
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
