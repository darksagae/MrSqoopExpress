import { NextResponse } from 'next/server';
import { isSettingsAdmin, savePromoImage, removePromoImage } from '@/lib/settings';

/** PUT { dataUrl } / DELETE — set or remove the promo banner image. Admin site only. */
const denied = () => NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

export async function PUT(request) {
  if (!isSettingsAdmin(request)) return denied();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    const r = await savePromoImage(body?.dataUrl);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, promoImageVersion: r.version });
  } catch (e) {
    console.error('[promo-banner] save failed:', e.message);
    return NextResponse.json({ error: 'Could not save the banner.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isSettingsAdmin(request)) return denied();
  try {
    await removePromoImage();
    return NextResponse.json({ ok: true, promoImageVersion: 0 });
  } catch (e) {
    console.error('[promo-banner] remove failed:', e.message);
    return NextResponse.json({ error: 'Could not remove the banner.' }, { status: 500 });
  }
}
