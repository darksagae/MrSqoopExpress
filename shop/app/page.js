'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCart } from './cart';
import { CATEGORIES } from '@/lib/categories';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');
const PAGE_SIZE = 20;

export default function Home() {
  // Real AliExpress product imagery, fetched once from /api/categories.
  // Until it lands, tiles and the hero render empty placeholder boxes.
  const [catImages, setCatImages] = useState({});
  const [heroImage, setHeroImage] = useState(null);
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
        if (d.hero) setHeroImage(d.hero);
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
      {/* ===== Hero ===== */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-eyebrow">Welcome to MrSqoopExpress</p>
            <h1 className="hero-title">
              EVERYTHING.<br />DELIVERED.
            </h1>
            <p className="hero-script">Quality tech, straight to Uganda.</p>
            <p className="hero-sub">
              Search millions of products and pay with Mobile Money.
              We handle the sourcing, shipping and delivery.
            </p>

            <div className="hero-actions">
              <a href="#shop" className="btn-solid">Shop Now <span aria-hidden="true">→</span></a>
              <a href="#categories" className="btn-outline">Browse Categories</a>
            </div>

            <ul className="hero-badges">
              <li>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M1 7h12v10H1z" /><path d="M13 10h4.5L22 13.5V17h-9" /><circle cx="6" cy="18.5" r="1.8" /><circle cx="17.5" cy="18.5" r="1.8" />
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
                <div><strong>Mobile Money</strong><span>Secure checkout</span></div>
              </li>
            </ul>
          </div>

          <div className="hero-visual">
            <span className="hero-disc">
              <em>EXPRESS</em>
              <strong>SHIPPING</strong>
            </span>
            <div className={`hero-float${heroImage ? '' : ' is-empty'}`}>
              {heroImage && <img src={heroImage} alt="" aria-hidden="true" />}
            </div>
          </div>
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

      {/* ===== Products ===== */}
      <section className="section section-space" id="shop">
        <div className="space-inner">
          <div className="shop-head">
            <h2 className="section-title">{query ? `Results for “${query}”` : 'Trending Products'}</h2>
          </div>

          <form className="shop-search" onSubmit={submitSearch}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search any product…"
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
        </div>
      </section>
    </>
  );
}
