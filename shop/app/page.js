'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');

export default function Home() {
  const [keyword, setKeyword] = useState('wireless earbuds');
  const [query, setQuery] = useState('wireless earbuds');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { add, setOpen } = useCart();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/products?keyword=${encodeURIComponent(query)}&limit=12`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d);
        else setProducts(d.products || []);
      })
      .catch((e) => !cancelled && setError({ error: 'Network error', message: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [query]);

  const submitSearch = (e) => {
    e.preventDefault();
    if (keyword.trim()) setQuery(keyword.trim());
  };

  return (
    <section className="section" id="shop">
      <form className="shop-search" onSubmit={submitSearch}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search products…"
        />
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {loading && <p className="shop-status">Loading products…</p>}

      {error && !loading && (
        <div className="shop-status error">
          <strong>{error.error || 'Could not load products'}</strong>
          {error.message && <div className="hint">{error.message}</div>}
          {error.hint && <div className="hint">{error.hint}</div>}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <p className="shop-status">No products found for “{query}”. Try another search.</p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="product-grid">
          {products.map((p) => (
            <article className="product-card" key={p.id}>
              <Link href={`/product/${p.id}`} className="product-img">
                {p.image && <img src={p.image} alt={p.title} />}
              </Link>
              <Link href={`/product/${p.id}`}>
                <h3 className="product-name">{p.title}</h3>
              </Link>
              <p className="product-price"><span className="new-price">{fmt(p.priceUGX)}</span></p>
              <button
                className="add-cart"
                onClick={() => { add({ id: p.id, name: p.title, price: p.priceUGX, img: p.image }); setOpen(true); }}
              >
                Add to Cart
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
