import { NextResponse } from 'next/server';
import { loadSettings, saveSettings, isSettingsAdmin } from '@/lib/settings';

/**
 * GET / PUT /api/admin/settings
 *
 * Called by the admin site (never the browser) with the shared ingest secret.
 * Reads or changes the exchange rate, handling fee percentage and promo banner.
 */
const denied = () => NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
const view = (s) => ({ rate: s.rate, handlingPercent: s.handlingPercent, promo: s.promo, promoImageVersion: s.promoImageVersion });

export async function GET(request) {
  if (!isSettingsAdmin(request)) return denied();
  return NextResponse.json({ settings: view(await loadSettings({ force: true })) }, { headers: { 'Cache-Control': 'no-store' } });
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
    return NextResponse.json({ settings: view(result.settings) });
  } catch (e) {
    console.error('[settings] save failed:', e.message);
    return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 });
  }
}
