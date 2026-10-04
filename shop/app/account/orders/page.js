'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thumb } from '@/lib/thumb';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');
const when = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MyOrdersPage() {
  const { status } = useSession();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/account/orders')
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => (ok ? setOrders(d.orders) : setError(d.error || 'Could not load your orders.')))
      .catch(() => setError('Could not load your orders.'));
  }, [status]);

  if (status === 'loading') return <div className="orders-page" />;

  if (status === 'unauthenticated') {
    return (
      <div className="orders-page">
        <h1>My orders</h1>
        <p className="orders-empty">Log in to see your orders.</p>
        <Link href="/login?next=/account/orders" className="btn-dark orders-btn">Log in</Link>
        <p className="orders-empty" style={{ marginTop: 18 }}>
          Ordered without an account? <a href="https://order.mrsqoopexpress.com" target="_blank" rel="noopener noreferrer">Track with your order number</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="orders-page">
      <h1>Track my orders</h1>
      {error && <p className="orders-empty">{error}</p>}
      {!error && !orders && <p className="orders-empty">Loading…</p>}
      {orders && orders.length === 0 && (
        <>
          <p className="orders-empty">No orders yet. Orders you place while logged in show up here.</p>
          <Link href="/" className="btn-dark orders-btn">Start shopping</Link>
        </>
      )}
      {orders?.map((o) => {
        const current = [...o.steps].reverse().find((st) => st.done);
        return (
          <article className="order-card" key={o.id}>
            <header>
              <div>
                <strong>{o.id}</strong>
                <span>{when(o.placedAt)}</span>
              </div>
              <span className={`order-badge${o.cancelled ? ' bad' : ''}`}>{o.statusLabel}</span>
            </header>
            <div className="order-thumbs">
              {o.items.slice(0, 4).map((i, k) => (
                <span key={k} className="order-thumb">{i.img && <img src={thumb(i.img, 120)} alt="" loading="lazy" />}</span>
              ))}
              <span className="order-items">
                {o.items.map((i) => `${i.qty > 1 ? i.qty + '× ' : ''}${i.name}`).join(', ')}
              </span>
            </div>
            <details className="order-steps">
              <summary>Track this order{o.expectedDelivery ? ` · expected ${o.expectedDelivery}` : ''}</summary>
              <ol>
                {o.steps.map((st) => (
                  <li key={st.key} className={st.done ? 'done' : ''}>
                    <span>{st.label}</span>
                    {st.at && <time>{when(st.at)}</time>}
                  </li>
                ))}
              </ol>
            </details>
            <footer>
              <strong>{fmt(o.amountUGX)}</strong>
              {!o.cancelled && current && <span>{current.label}</span>}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
