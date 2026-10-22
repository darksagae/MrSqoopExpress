import { NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/categories';
import { cachedCategoryImages } from '@/lib/browse-products';

// Icons reuse successful category listings instead of competing with them for
// supplier quota. Rows also fill their own icon as soon as products arrive.
export async function GET() {
  let categories;
  try { categories = await cachedCategoryImages(CATEGORIES); } catch { /* rows provide photos when ready */ }
  if (!categories?.length) categories = CATEGORIES.map((cat) => ({ ...cat, image: null }));
  const heroPool = categories.map((cat) => cat.image).filter(Boolean);
  return NextResponse.json({ success: true, source: 'cached-listings', categories,
    hero: heroPool[0] || null, heroPool,
  }, { headers: { 'Cache-Control': heroPool.length ? 'public, s-maxage=60, stale-while-revalidate=3600' : 'no-store' } });
}
