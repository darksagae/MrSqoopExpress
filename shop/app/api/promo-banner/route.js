import { getPromoImage } from '@/lib/settings';

/**
 * GET /api/promo-banner?v=<version>
 * The promo banner image set in the admin. The version in the URL changes with
 * every upload, so each version can be cached for good.
 */
export async function GET(request) {
  let row = null;
  try {
    row = await getPromoImage(new URL(request.url).searchParams.get('id') || 'promo-banner');
  } catch (e) {
    console.error('[promo-banner] read failed:', e.message);
  }
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(row.data, {
    headers: {
      'Content-Type': row.content_type,
      'Cache-Control': 'public, max-age=3600, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
