'use client';

import Link from 'next/link';
import { useCart } from '../cart';
import UserMenu from './UserMenu';

export default function SiteHeader() {
  const { count, setOpen } = useCart();

  return (
    <>
      <div className="announcement">
        <div className="marquee">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i}>express shipping within 15 business days</span>
          ))}
        </div>
      </div>

      <header className="header">
        <nav className="nav-left">
          <Link href="/#shop" className="active">Shop Now</Link>
          <a href="https://mrsqoopexpress.com" target="_blank" rel="noopener noreferrer">Track Order</a>
        </nav>
        <Link href="/" className="logo">
          <span className="logo-title">MrSqoopExpress</span>
          <span className="logo-sub">EXPRESS TECH SHOP</span>
        </Link>
        <div className="nav-right">
          <Link href="/#shop" className="icon-btn" aria-label="Search">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          </Link>
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
