import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { HERO_KEYWORD } from '@/lib/categories';

/**
 * GET /api/categories
 *
 * A single real AliExpress product photo for the homepage hero. Category
 * tiles use a fixed icon set (see CategoryIcons.js), not live photos, so
 * this no longer needs one upstream call per category — just the hero's.
 * Cached for an hour rather than re-fetched on every page view.
 */
export const revalidate = 3600;

const firstImage = (r) =>
  r.status === 'fulfilled' && r.value?.[0]?.image ? r.value[0].image : null;

export async function GET() {
  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json({ success: true, source: 'unconfigured', hero: null });
  }

  const result = await Promise.allSettled([
    aliexpressDS.searchProducts({
      keyword: HERO_KEYWORD,
      page: 1,
      pageSize: 1,
      countryCode: 'UG',
      currency: 'USD',
    }),
  ]);

  if (result[0].status === 'rejected') {
    console.warn(`Hero image lookup failed for "${HERO_KEYWORD}":`, result[0].reason?.message);
  }

  return NextResponse.json({
    success: true,
    source: 'aliexpress',
    hero: firstImage(result[0]),
  });
}
