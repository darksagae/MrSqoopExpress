'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '../cart';
import MenuDrawer from './MenuDrawer';

/**
 * Menu button on the left, the logo in the middle, the cart (with its count) on
 * the right. Everything else (Track Order, the account, categories, policies)
 * lives in the menu.
 */
export default function SiteHeader() {
  const { count, setOpen } = useCart();
  const [menu, setMenu] = useState(false);

  return (
    <>
      {/* One sentence, scrolling. The repeats only fill the strip for the
          animation, so they are hidden from screen readers. */}
      <div className="announcement">
        <div className="marquee">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} aria-hidden={i > 0 ? 'true' : undefined}>Shipping to Uganda · delivery time shown on every product</span>
          ))}
        </div>
      </div>

      <header className="header">
        <button type="button" className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/" className="logo" aria-label="Mr Sqoop Express, home">
          <img src="/logo-black.png" alt="Mr Sqoop Express" width="600" height="266" />
        </Link>
        <div className="nav-right">
          <button className="icon-btn cart-btn" onClick={() => setOpen(true)} aria-label={count > 0 ? `Open cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Open cart'}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 4h2.4l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" />
              <circle cx="9.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" />
            </svg>
            {count > 0 && <span className="cart-count">{count}</span>}
          </button>
        </div>
      </header>

      <MenuDrawer open={menu} onClose={() => setMenu(false)} />
    </>
  );
}
