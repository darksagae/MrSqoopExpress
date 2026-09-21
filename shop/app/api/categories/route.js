import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { CATEGORIES, HERO_TRENDING_KEYWORDS } from '@/lib/categories';

/**
 * GET /api/categories
 *
 * Real AliExpress product imagery for the homepage: one image per category
 * tile, plus a pool of trending images for the rotating hero. That's a
 * handful of upstream calls, so the response is cached for an hour rather
 * than re-fetched on every page view.
 *
 * Anything that fails comes back as null/empty and the client renders an
 * empty placeholder, so one bad keyword can't break the row.
 */
export const revalidate = 3600;

// Best-seller sort, not the default relevance ranking: the top relevance hit
// for a broad keyword is often a one-off listing whose photo is a
// promotional graphic (badges, callout text, a collage of variants) rather
// than a clean product shot. Established best-sellers are far more likely
// to carry standard catalog photography. A few results are fetched per
// keyword — not just one — so a listing with a missing image doesn't leave
// the tile empty, and so the hero pool has more than one candidate per term.
const allImages = (r) => (r.status === 'fulfilled' ? r.value.map((p) => p?.image).filter(Boolean) : []);
const firstImage = (r) => allImages(r)[0] || null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function GET() {
  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json({
      success: true,
      source: 'unconfigured',
      hero: null,
      heroPool: [],
      categories: CATEGORIES.map(({ label, keyword }) => ({ label, keyword, image: null })),
    });
  }

  const categoryKeywords = CATEGORIES.map((c) => c.keyword);
  const keywords = [...categoryKeywords, ...HERO_TRENDING_KEYWORDS];
  const results = await Promise.allSettled(
    keywords.map((keyword) =>
      aliexpressDS.searchProducts({
        keyword,
        page: 1,
        pageSize: 5,
        countryCode: 'UG',
        currency: 'USD',
        sort: 'orders_desc',
      })
    )
  );

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`Image lookup failed for "${keywords[i]}":`, r.reason?.message);
    }
  });

  const categoryResults = results.slice(0, categoryKeywords.length);
  const trendingResults = results.slice(categoryKeywords.length);

  // Pool of trending images for the hero: every image from every trending
  // keyword's top 5 best-sellers, deduplicated and shuffled so the rotation
  // order isn't identical on every page load.
  const heroPool = shuffle([...new Set(trendingResults.flatMap(allImages))]);

  return NextResponse.json({
    success: true,
    source: 'aliexpress',
    hero: heroPool[0] || null,
    heroPool,
    categories: CATEGORIES.map(({ label, keyword }, i) => ({
      label,
      keyword,
      image: firstImage(categoryResults[i]),
    })),
  });
}
