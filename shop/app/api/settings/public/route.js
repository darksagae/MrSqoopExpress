import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings';
import { promoExpired } from '@/lib/promo';
import { isCardConfigured } from '@/lib/payments/card';

/**
 * GET /api/settings/public — what the storefront may use: the promo banner,
 * the Meta Pixel ID (public by nature; it is in the page source of every site
 * that uses one) and how card payment works right now: 'secure' (Secure
 * Acceptance keys set), 'link' (Absa's payment link saved in the admin) or
 * null (no card payment, so checkout doesn't offer it).
 */
export async function GET() {
  const { promo, promoImageVersion, meta, cardPayLink } = await loadSettings();
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
      card: isCardConfigured() ? 'secure' : cardPayLink ? 'link' : null,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
