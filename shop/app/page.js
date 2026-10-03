import HomeClient from './HomeClient';
import { aliexpressDS } from '@/lib/aliexpress';
import { getBestPicks } from '@/lib/best-picks';

// The home page is built ahead of time with the first page of best picks inside
// it, then rebuilt in the background at most every 30 minutes. Visitors get
// ready-made HTML from the CDN instead of waiting on AliExpress.
export const revalidate = 1800;

async function loadInitial() {
  if (!aliexpressDS.hasCredentials()) return null;

  const building = process.env.NEXT_PHASE === 'phase-production-build';
  try {
    const picks = await getBestPicks({ page: 1, limit: 20 });
    if (picks.products.length) return picks;
    throw new Error('no best picks returned');
  } catch (error) {
    // A hiccup at AliExpress must never fail a deploy: ship the page without
    // products and let the browser fetch them. Once live, throwing instead makes
    // Next keep serving the last good copy rather than swapping in an empty one.
    if (building) {
      console.warn('[home] building without pre-rendered best picks:', error.message);
      return null;
    }
    throw error;
  }
}

export default async function Home() {
  return <HomeClient initial={await loadInitial()} />;
}
