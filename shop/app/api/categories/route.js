import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { CATEGORIES, HERO_KEYWORD } from '@/lib/categories';

/**
 * GET /api/categories
 *
 * Real AliExpress product imagery for the homepage: one image per category
 * tile plus one for the hero. That's a handful of upstream calls, so the
 * response is cached for an hour rather than re-fetched on every page view.
 *
 * Anything that fails comes back as null and the client renders an empty
 * placeholder, so one bad keyword can't break the row.
 */
export const revalidate = 3600;

const firstImage = (r) =>
  r.status === 'fulfilled' && r.value?.[0]?.image ? r.value[0].image : null;

export async function GET() {
  if (!aliexpressDS.isConfigured()) {
    return NextResponse.json({
      success: true,
      source: 'unconfigured',
      hero: null,
      categories: CATEGORIES.map(({ label, keyword }) => ({ label, keyword, image: null })),
    });
  }

  const keywords = [...CATEGORIES.map((c) => c.keyword), HERO_KEYWORD];
  const results = await Promise.allSettled(
    keywords.map((keyword) =>
      aliexpressDS.searchProducts({
        keyword,
        page: 1,
        pageSize: 1,
        countryCode: 'UG',
        currency: 'USD',
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`Image lookup failed for "${keywords[i]}":`, r.reason?.message);
    }
  });

  return NextResponse.json({
    success: true,
    source: 'aliexpress',
    hero: firstImage(results[results.length - 1]),
    categories: CATEGORIES.map(({ label, keyword }, i) => ({
      label,
      keyword,
      image: firstImage(results[i]),
    })),
  });
}
