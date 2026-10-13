'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { markNoticeSeen, noticeSeen, optOut, optedOut, startPixel, stopPixel, track } from '@/lib/meta-pixel';

/**
 * Starts the Meta Pixel when one is set in the admin, after the page has
 * finished loading so the shop isn't slowed down, and counts a page view on
 * every page, including moves between pages inside the shop.
 *
 * The first time, a small notice says what the tracking is for, with a way to
 * turn it off on this device.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const go = () =>
      fetch('/api/settings/public')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (!d?.metaPixelId || optedOut()) return stopPixel();
          startPixel(d.metaPixelId);
          if (!noticeSeen()) setNotice(true);
        })
        .catch(() => stopPixel());
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', go);
    };
  }, []);

  useEffect(() => {
    track('PageView');
  }, [pathname]);

  if (!notice) return null;
  return (
    <div className="track-notice" role="region" aria-label="Cookies">
      <p>
        We use cookies to see how the shop is used and to show you relevant ads. See our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <div className="track-notice-actions">
        <button
          type="button"
          className="track-notice-no"
          onClick={() => {
            optOut();
            setNotice(false);
          }}
        >
          No thanks
        </button>
        <button
          type="button"
          className="track-notice-ok"
          onClick={() => {
            markNoticeSeen();
            setNotice(false);
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
