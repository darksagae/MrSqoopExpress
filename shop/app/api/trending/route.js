import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { getBestPicks } from '@/lib/best-picks';

const MAX_LIMIT = 30;
// Everyone sees the same best sellers, so let the CDN answer most requests:
// each uncached one costs a ranking lookup plus a freight quote per product.
const CACHE = 'public, s-maxage=1800, stale-while-revalidate=86400';

/**
 * GET /api/trending?page=1&limit=20
 *
 * The storefront's default listing — what AliExpress ranks as best selling,
 * priced and shipping-quoted exactly like a search. Anything no seller will
 * ship to Uganda is left out.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json(
      { error: 'Products are not available right now.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const { source, products: priced, hasMore } = await getBestPicks({ page, limit });

    // Past the end of the list is just an empty page; only an empty first page is a failure.
    if (!priced.length && page > 1) {
      return NextResponse.json(
        { success: true, source, count: 0, hasMore: false, products: [] },
        { headers: { 'Cache-Control': CACHE } }
      );
    }
    if (!priced.length) {
      return NextResponse.json(
        { error: 'No trending products are available right now.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { success: true, source, count: priced.length, hasMore, products: priced },
      { headers: { 'Cache-Control': CACHE } }
    );
  } catch (error) {
    console.error('Trending fetch failed:', error);
    return NextResponse.json(
      { error: 'Could not load trending products.', code: error.code || 'UNKNOWN' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
