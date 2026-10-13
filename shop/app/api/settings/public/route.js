import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings';
import { promoExpired } from '@/lib/promo';

/**
 * GET /api/settings/public — what the storefront may use: the promo banner and
 * the Meta Pixel ID (public by nature; it is in the page source of every site
 * that uses one).
 */
export async function GET() {
  const { promo, promoImageVersion, meta } = await loadSettings();
  // An expired promo disappears on its own after its last day.
  const show = promo.enabled && !promoExpired(promo) && (promo.code || promo.text || promoImageVersion > 0);
  return NextResponse.json(
    {
      promo: show
        ? {
            code: promo.code,
            text: promo.text,
            minOrder: promo.minOrder || 0,
            endsAt: promo.endsAt || null,
            image: promoImageVersion > 0 ? `/api/promo-banner?v=${promoImageVersion}` : null,
          }
        : null,
      metaPixelId: meta?.pixelId || null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
