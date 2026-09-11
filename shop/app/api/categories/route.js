import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { CATEGORIES } from '@/lib/categories';

/**
 * GET /api/categories
 *
 * Returns the category strip with a real AliExpress product image for each
 * tile. One upstream call per category, so the result is cached for an hour
 * rather than re-fetched on every homepage view.
 *
 * Categories whose lookup fails come back with image: null — the client falls
 * back to the bundled artwork so a single upstream hiccup can't empty the row.
 */
export const revalidate = 3600;

export async function GET() {
  if (!aliexpressDS.isConfigured()) {
    return NextResponse.json({
      success: true,
      source: 'fallback',
      categories: CATEGORIES.map(({ label, keyword }) => ({ label, keyword, image: null })),
    });
  }

  const results = await Promise.allSettled(
    CATEGORIES.map(({ keyword }) =>
      aliexpressDS.searchProducts({
        keyword,
        page: 1,
        pageSize: 1,
        countryCode: 'UG',
        currency: 'USD',
      })
    )
  );

  const categories = CATEGORIES.map(({ label, keyword }, i) => {
    const r = results[i];
    const image =
      r.status === 'fulfilled' && r.value?.[0]?.image ? r.value[0].image : null;
    if (r.status === 'rejected') {
      console.warn(`Category image lookup failed for "${keyword}":`, r.reason?.message);
    }
    return { label, keyword, image };
  });

  return NextResponse.json({ success: true, source: 'aliexpress', categories });
}
