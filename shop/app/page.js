'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');
const PAGE_SIZE = 20;

export default function Home() {
  const [keyword, setKeyword] = useState('wireless earbuds');
  const [query, setQuery] = useState('wireless earbuds');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  // Set once we get back fewer than PAGE_SIZE results — AliExpress has more
  // pages than that on almost any keyword, so a short page means "last page",
  // not "that's all there is".
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true); // initial search / new keyword
  const [loadingMore, setLoadingMore] = useState(false); // appending next page
  const [error, setError] = useState(null);

  // New search term: reset to page 1 and replace the list.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    fetch(`/api/products?keyword=${encodeURIComponent(query)}&page=1&limit=${PAGE_SIZE}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d);
          setProducts([]);
          setHasMore(false);
        } else {
          const list = d.products || [];
          setProducts(list);
          setHasMore(list.length >= PAGE_SIZE);
        }
      })
      .catch((e) => !cancelled && setError({ error: 'Network error', message: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [query]);

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetch(`/api/products?keyword=${encodeURIComponent(query)}&page=${nextPage}&limit=${PAGE_SIZE}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setHasMore(false);
          return;
        }
        const list = d.products || [];
        setProducts((prev) => {
          // Guard against AliExpress ever repeating an item across pages.
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...list.filter((p) => !seen.has(p.id))];
        });
        setPage(nextPage);
        setHasMore(list.length >= PAGE_SIZE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  };

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
        <>
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

          {hasMore && (
            <button
              type="button"
              className="load-more"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'View More'}
            </button>
          )}

          {!hasMore && (
            <p className="shop-status">You’ve reached the end of the results for “{query}”.</p>
          )}
        </>
      )}
    </section>
  );
}
