import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';

const MARKUP_PERCENTAGE = parseFloat(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE || '35');
const USD_TO_UGX_RATE = parseFloat(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE || '3700');

/**
 * GET /api/products?keyword=...&page=1&limit=20
 *
 * Fetches REAL products from the AliExpress Dropshipping API, applies your
 * markup, and converts prices to UGX. No mock/placeholder data — if the API
 * is not yet usable (e.g. no production access_token) it returns a clear error.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  if (!keyword) {
    return NextResponse.json(
      { error: 'A "keyword" query parameter is required to search products.' },
      { status: 400 }
    );
  }

  // If credentials/token aren't in place yet, say so plainly.
  if (!aliexpressDS.isConfigured()) {
    return NextResponse.json(
      {
        error: 'AliExpress Dropshipping API is not connected yet.',
        missing: aliexpressDS.missingConfig(),
        hint: 'You need production API approval, then complete the OAuth flow to obtain ALIEXPRESS_ACCESS_TOKEN. Until then, real products cannot be fetched.',
      },
      { status: 503 }
    );
  }

  try {
    const products = await aliexpressDS.searchProducts({
      keyword,
      page,
      pageSize: limit,
      countryCode: 'UG',
      currency: 'USD',
    });

    const priced = products.map((p) => {
      const finalUSD = p.priceUSD * (1 + MARKUP_PERCENTAGE / 100);
      const finalUGX = Math.round(finalUSD * USD_TO_UGX_RATE);
      return {
        id: p.id,
        title: p.title,
        image: p.image,
        url: p.url,
        priceUGX: finalUGX,       // what the customer sees
        currency: 'UGX',
        _sourcePriceUSD: p.priceUSD, // internal only
      };
    });

    return NextResponse.json({
      success: true,
      count: priced.length,
      keyword,
      markupPercentage: MARKUP_PERCENTAGE,
      exchangeRate: USD_TO_UGX_RATE,
      products: priced,
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
