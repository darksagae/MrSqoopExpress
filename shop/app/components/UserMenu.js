'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

// Account control in the header: a Log in link when signed out, or the user's
// name with a dropdown (sign out) when signed in.
export default function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  if (status === 'loading') return <span className="icon-btn" aria-hidden />;

  if (!session?.user) {
    return (
      <Link href="/login" className="icon-btn" aria-label="Log in">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      </Link>
    );
  }

  const label = session.user.name || session.user.email;
  const initial = (label || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="usermenu">
      <button className="usermenu-btn" onClick={() => setOpen((v) => !v)} aria-label="Account">
        {session.user.image
          ? <img src={session.user.image} alt="" className="usermenu-avatar" />
          : <span className="usermenu-avatar initial">{initial}</span>}
      </button>
      {open && (
        <>
          <div className="usermenu-overlay" onClick={() => setOpen(false)} />
          <div className="usermenu-pop">
            <div className="usermenu-name">{label}</div>
            <Link href="/account/orders" className="usermenu-item" onClick={() => setOpen(false)}>My orders</Link>
            <button className="usermenu-item" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
