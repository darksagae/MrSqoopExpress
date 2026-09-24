'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';
import { CATEGORIES } from '@/lib/categories';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');
const PAGE_SIZE = 20;

export default function Home() {
  // Real supplier product imagery, fetched once from /api/categories.
  // Until it lands, tiles render empty placeholder boxes.
  const [catImages, setCatImages] = useState({});
  const [keyword, setKeyword] = useState('wireless earbuds');
  const [query, setQuery] = useState('wireless earbuds');
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  // Set once we get back fewer than PAGE_SIZE results — the catalog has more
  // pages than that on almost any keyword, so a short page means "last page",
  // not "that's all there is".
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true); // initial search / new keyword
  const [loadingMore, setLoadingMore] = useState(false); // appending next page
  const [error, setError] = useState(null);

  const { add, setOpen } = useCart();

  // Category artwork — fetched once, cached upstream for an hour.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.categories) return;
        const byKeyword = {};
        for (const c of d.categories) {
          if (c.image) byKeyword[c.keyword] = c.image;
        }
        setCatImages(byKeyword);
      })
      .catch(() => {/* placeholders stay in place */});
    return () => { cancelled = true; };
  }, []);

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
          setHasMore(Boolean(d.hasMore));
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
        setHasMore(Boolean(d.hasMore));
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  };

  const submitSearch = (e) => {
    e.preventDefault();
    if (keyword.trim()) setQuery(keyword.trim());
  };

  const pickCategory = (cat) => {
    setKeyword(cat.keyword);
    setQuery(cat.keyword);
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ===== Search bar ===== */}
      <div className="top-search">
        <form className="shop-search" onSubmit={submitSearch}>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search any product…"
          />
          <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        </form>
      </div>

      {/* ===== Products ===== */}
      <section className="section section-space" id="shop">
        <div className="space-inner">
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
        </div>
      </section>

      {/* ===== Categories ===== */}
      <section className="section cat-section" id="categories">
        <h2 className="section-title">Browse by Category</h2>
        <div className="cat-strip">
          {CATEGORIES.map((cat) => (
            <button
              type="button"
              key={cat.label}
              className={`cat-tile${query === cat.keyword ? ' is-active' : ''}`}
              onClick={() => pickCategory(cat)}
            >
              <span className={`cat-tile-img${catImages[cat.keyword] ? '' : ' is-empty'}`}>
                {catImages[cat.keyword] && (
                  <img src={catImages[cat.keyword]} alt="" aria-hidden="true" />
                )}
              </span>
              <span className="cat-tile-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ===== Trust badges ===== */}
      <section className="section">
        <ul className="hero-badges">
          <li>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="M22 12.5l-7.5-3.2V4a1.5 1.5 0 0 0-3 0v5.3L4 12.5v2l7.5-2.3V18l-2.5 1.7V21l3-1 3 1v-1.3L12.5 18v-5.8L20 14.5v-2z" />
            </svg>
            <div><strong>Express Shipping</strong><span>To Uganda within 7-15 business days</span></div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="M3 12a9 9 0 1 1 3 6.7" /><polyline points="3 20 3 14 9 14" />
            </svg>
            <div><strong>Order Tracking</strong><span>Follow every step</span></div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <rect x="3" y="10" width="18" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <div><strong>Mobile Money | Bank Card</strong><span>Secure checkout</span></div>
          </li>
        </ul>
      </section>
    </>
  );
}
