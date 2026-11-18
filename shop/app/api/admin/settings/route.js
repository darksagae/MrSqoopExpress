import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, isSettingsAdmin, getPromoImages } from '@/lib/settings';

/**
 * GET / PUT /api/admin/settings
 *
 * Called by the admin site (never the browser) with the shared ingest secret.
 * Reads or changes the exchange rate, handling fee percentage, promo banner and
 * Meta ads tracking.
 */
const denied = () => NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
// The Conversions API token never leaves the server: the admin only learns
// whether one is saved.
const view = async (s) => ({
  promoBanners: await getPromoImages(),
  promoRotationSeconds: s.promoRotationSeconds,
  rate: s.rate,
  handlingPercent: s.handlingPercent,
  promo: s.promo,
  promoImageVersion: s.promoImageVersion,
  meta: s.meta,
  metaCapiTokenSet: Boolean(s.metaCapiToken),
  cardPayLink: s.cardPayLink,
});

export async function GET(request) {
  if (!isSettingsAdmin(request)) return denied();
  return NextResponse.json({ settings: await view(await loadSettings({ force: true })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request) {
  if (!isSettingsAdmin(request)) return denied();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    const result = await saveSettings(body);
    if (!result.ok) return NextResponse.json({ error: result.errors.join(' ') }, { status: 400 });
    return NextResponse.json({ settings: await view(result.settings) });
  } catch (e) {
    console.error('[settings] save failed:', e.message);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
