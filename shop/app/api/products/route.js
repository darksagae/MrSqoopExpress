import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { quoteFreightForAll, priceProducts } from '@/lib/catalog';
import {
  CUSTOMER_DESTINATION,
  CUSTOMER_DESTINATION_LABEL,
  HANDLING_FEE_PERCENT,
} from '@/lib/shipping-destination';

// Prices are shown exactly as AliExpress lists them, so there is no markup by
// default. The variable stays so a margin can be reintroduced deliberately
// rather than by forgetting to remove one.
const MARKUP_PERCENTAGE = parseFloat(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE || '0');
const USD_TO_UGX_RATE = parseFloat(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE || '3700');

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

    const priced = priceProducts(products, freights);

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
