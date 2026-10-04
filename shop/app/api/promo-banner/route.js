import { getPromoImage } from '@/lib/settings';

/**
 * GET /api/promo-banner?v=<version>
 * The promo banner image set in the admin. The version in the URL changes with
 * every upload, so each version can be cached for good.
 */
export async function GET() {
  let row = null;
  try {
    row = await getPromoImage();
  } catch (e) {
    console.error('[promo-banner] read failed:', e.message);
  }
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.data, {
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
