import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings';
import { promoExpired } from '@/lib/promo';

/** GET /api/settings/public — what the storefront may show: the promo banner. */
export async function GET() {
  const { promo, promoImageVersion } = await loadSettings();
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
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
