import { NextResponse } from 'next/server';
import { loadSettings } from '@/lib/settings';

/** GET /api/settings/public — what the storefront may show: the promo banner. */
export async function GET() {
  const { promo } = await loadSettings();
  return NextResponse.json(
    { promo: promo.enabled ? { code: promo.code, text: promo.text, minOrder: promo.minOrder || 0 } : null },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
