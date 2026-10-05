import { Suspense } from 'react';
import HomeClient from './HomeClient';
import HomeSeo from './components/HomeSeo';
import { aliexpressDS } from '@/lib/aliexpress';
import { getBestPicks } from '@/lib/best-picks';

// The home page is built ahead of time with the first page of best picks inside
// it, then rebuilt in the background at most every 30 minutes. Visitors get
// ready-made HTML from the CDN instead of waiting on AliExpress.
export const revalidate = 1800;

export const metadata = {
  title: { absolute: 'Mr Sqoop Express | Online Shopping & Delivery in Uganda' },
  description:
    'Shop online with Mr Sqoop Express and get your orders delivered to Uganda. Shop from international stores, enjoy reliable shipping and easy order tracking.',
  alternates: { canonical: '/' },
};

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
  // HomeClient reads the search from the URL, which needs a Suspense boundary.
  return (
    <>
      <Suspense fallback={null}>
        <HomeClient initial={await loadInitial()} />
      </Suspense>
      <HomeSeo />
    </>
  );
}
