'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { CATEGORIES } from '@/lib/categories';

/**
 * The menu behind the header's menu button: where to go, the account, and the
 * categories. Closes on Esc, on the dimmed backdrop and on any choice.
 */
export default function MenuDrawer({ open, onClose }) {
  const { data: session, status } = useSession();
  const user = session?.user || null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = was;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="menu-wrap">
      <div className="menu-backdrop" onClick={onClose} />
      <nav className="menu-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="menu-top">
          <span className="menu-title">Menu</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="menu-account">
          {status === 'loading' ? null : user ? (
            <>
              <strong>{user.name || 'Welcome'}</strong>
              {user.email && <span>{user.email}</span>}
            </>
          ) : (
            <div className="menu-auth">
              <Link href="/login" className="menu-btn-dark" onClick={onClose}>Log in</Link>
              <Link href="/signup" className="menu-btn-light" onClick={onClose}>Sign up</Link>
            </div>
          )}
        </div>

        <div className="menu-links">
          <Link href="/#shop" onClick={onClose}>Shop Now</Link>
          <Link href="/account/orders" onClick={onClose}>Track Order</Link>
        </div>

        <p className="menu-h">Categories</p>
        <div className="menu-links">
          {CATEGORIES.map((c) => (
            <a key={c.keyword} href={`/?q=${encodeURIComponent(c.keyword)}#shop`}>{c.label}</a>
          ))}
        </div>

        <p className="menu-h">Help</p>
        <div className="menu-links">
          <Link href="/international-shopping-uganda" onClick={onClose}>Shopping to Uganda: how it works</Link>
          <Link href="/returns" onClick={onClose}>Return policy</Link>
          <Link href="/privacy" onClick={onClose}>Privacy policy</Link>
          <a href="mailto:support@mrsqoopexpress.com">Contact support</a>
        </div>

        {user && (
          <button type="button" className="menu-signout" onClick={() => { onClose(); signOut({ callbackUrl: '/' }); }}>
            Sign out
          </button>
        )}
      </nav>
    </div>
  );
}
