'use client';

import Link from 'next/link';
import { useCart } from '../cart';
import UserMenu from './UserMenu';

export default function SiteHeader() {
  const { count, setOpen } = useCart();

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
        <nav className="nav-left">
          <Link href="/#shop" className="active">Shop Now</Link>
          <Link href="/account/orders">Track Order</Link>
        </nav>
        <Link href="/" className="logo">
          <span className="logo-title">MrSqoopExpress</span>
          <span className="logo-sub">YOU SHOP. WE SHIP. YOU SMILE.</span>
        </Link>
        <div className="nav-right">
          <button className="icon-btn cart-btn" onClick={() => setOpen(true)} aria-label="Open cart">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
            {count > 0 && <span className="cart-count">{count}</span>}
          </button>
          <UserMenu />
        </div>
      </header>
    </>
  );
}
