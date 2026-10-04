import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings';

/** GET /api/settings/public — what the storefront may show: the promo banner. */
export async function GET() {
  const { promo, promoImageVersion } = await loadSettings();
  const show = promo.enabled && (promo.code || promo.text || promoImageVersion > 0);
  return NextResponse.json(
    {
      promo: show
        ? {
            code: promo.code,
            text: promo.text,
            minOrder: promo.minOrder || 0,
            image: promoImageVersion > 0 ? `/api/promo-banner?v=${promoImageVersion}` : null,
          }
        : null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
