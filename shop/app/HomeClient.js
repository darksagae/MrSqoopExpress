'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCart } from './cart';
import { track } from '@/lib/meta-pixel';
import { CATEGORIES } from '@/lib/categories';
import { thumb } from '@/lib/thumb';
import PromoBanner from './components/PromoBanner';
import SortFilter from './components/SortFilter';
import { DEFAULT_VIEW, applyView } from '@/lib/product-view';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');
const PAGE_SIZE = 20;

// 1800 -> "1.8K", 12400 -> "12K", 2100000 -> "2.1M"
function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path fill="#2e9d4f" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b6fd6" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 6h11v9H2zM13 9h4l3 3v3h-7z" /><circle cx="6.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" />
    </svg>
  );
}

/** One product tile, used in both the best-picks row and search results. */
function ProductCard({ p, onAdd, eager = false }) {
  const unavailable = p.shipping?.deliverable === false;
  const href = `/product/${p.id}`;

  return (
    <article className="pc">
      <div className="pc-media">
        <Link href={href} className="pc-img" aria-label={p.title}>
          {p.image && (
            <img
              src={thumb(p.image)}
              alt=""
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={eager ? 'high' : undefined}
              decoding="async"
            />
          )}
        </Link>
        <button
          type="button"
          className="pc-add"
          aria-label={`Add ${p.title} to cart`}
          disabled={unavailable}
          onClick={() => onAdd(p)}
        >
          +
        </button>
      </div>

      <Link href={href}><h3 className="pc-title">{p.title}</h3></Link>

      {(p.rating || p.sold) && (
        <p className="pc-meta">
          {p.rating && <><StarIcon /><strong>{p.rating.toFixed(1)}</strong></>}
          {p.sold && <span>{p.rating ? '·' : ''} {compact(p.sold)} sold</span>}
        </p>
      )}

      <p className="pc-price">
        <strong>{fmt(p.priceUGX)}</strong>
        {p.originalUGX && <s>{fmt(p.originalUGX)}</s>}
        {p.discountPct && <span className="pc-off">{p.discountPct}%</span>}
      </p>

      {p.shipping?.free && <p className="pc-ship"><TruckIcon /> Free Delivery</p>}
    </article>
  );
}

/**
 * One paged list that is either AliExpress's best picks (no search) or the
 * results of a search. Switching query starts over from page one.
 *
 * `initial` is the first page of best picks already rendered into the HTML, so
 * the default view appears with no request at all.
 */
function useFeed(query, initial) {
  const [items, setItems] = useState(initial?.products ?? []);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initial ? initial.hasMore : true);
  const [loading, setLoading] = useState(!initial);
  const seeded = useRef(Boolean(initial));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const urlFor = useCallback(
    (n) =>
      query
        ? `/api/products?keyword=${encodeURIComponent(query)}&page=${n}&limit=${PAGE_SIZE}`
        : `/api/trending?page=${n}&limit=${PAGE_SIZE}`,
    [query]
  );

  useEffect(() => {
    // The first render already holds the pre-rendered best picks.
    if (seeded.current && !query) {
      seeded.current = false;
      return undefined;
    }
    seeded.current = false;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    const first = () =>
      fetch(urlFor(1))
        .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d })))
        .then((res) => {
          // Empty or failed (supplier briefly busy): wait and try once more, past
          // any cached copy. "Busy" waits out the supplier's short pause.
          if (!res.ok || !(res.d.products || []).length) {
            return new Promise((r) => setTimeout(r, res.status === 503 ? 6000 : 1500)).then(() =>
              fetch(`${urlFor(1)}&_=${Date.now()}`).then((r) => r.json().then((d) => ({ ok: r.ok, d }))));
          }
          return res;
        });
    first()
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d);
          setItems([]);
          setHasMore(false);
        } else {
          setItems(d.products || []);
          setHasMore(Boolean(d.hasMore));
        }
      })
      .catch((e) => !cancelled && setError({ error: 'Network error', message: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [urlFor, query]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    const next = page + 1;
    setLoadingMore(true);
    fetch(urlFor(next))
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setHasMore(false);
          return;
        }
        const list = d.products || [];
        // AliExpress can repeat an item across pages.
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...list.filter((p) => !seen.has(p.id))];
        });
        setPage(next);
        setHasMore(Boolean(d.hasMore));
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [urlFor, page, hasMore, loading, loadingMore]);

  return { items, hasMore, loading, loadingMore, error, loadMore };
}

const ROW_SIZE = 10;

// The submitted search lives in the address bar (/?q=shoes). It is read straight
// from the URL instead of with useSearchParams, because that hook forces the
// whole page to render in the browser only, which would hide the home page's
// heading and its ready-made products from search engines.
function subscribeUrl(cb) {
  window.addEventListener('popstate', cb);
  window.addEventListener('mse:url', cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener('mse:url', cb);
  };
}
const readQuery = () => new URLSearchParams(window.location.search).get('q') || '';
const serverQuery = () => '';

// Recent searches belong to one person. Signed in, they are kept on this
// device under that account only, so someone else signing in on the same phone
// never sees them. Not signed in, they last only for this browser session.
const RECENT_MAX = 8;
let recentOwner = null; // account id, or null for a guest

function recentStore() {
  return recentOwner ? localStorage : sessionStorage;
}
function recentKey() {
  return recentOwner ? `mse_recent_searches:${recentOwner}` : 'mse_recent_searches:guest';
}
function readRecent() {
  try {
    const v = JSON.parse(recentStore().getItem(recentKey()) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function writeRecent(list) {
  try { recentStore().setItem(recentKey(), JSON.stringify(list)); } catch { /* storage blocked */ }
}

/**
 * Gentle motion for a row of products: it drifts sideways by itself while it is
 * on screen and turns back at each end. It stops as soon as someone touches,
 * hovers or scrolls it, resumes a few seconds after they let go, and does
 * nothing for people whose device asks for reduced motion.
 */
function useDrift(ref, { reverse = false, active = true } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    let visible = false;
    let dir = reverse ? -1 : 1;
    let pausedUntil = performance.now() + 1200;
    let last = performance.now();
    let pos = el.scrollLeft;
    const SPEED = 24; // pixels per second
    const hold = (ms = 4000) => { pausedUntil = performance.now() + ms; pos = el.scrollLeft; };
    const tick = (now) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const max = el.scrollWidth - el.clientWidth;
      if (visible && max > 4 && now > pausedUntil && !document.hidden) {
        if (dir < 0 && pos === 0 && el.scrollLeft === 0) { pos = max; el.scrollLeft = max; }
        pos += dir * SPEED * dt;
        if (pos >= max) { pos = max; dir = -1; pausedUntil = now + 1200; }
        else if (pos <= 0) { pos = 0; dir = 1; pausedUntil = now + 1200; }
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    const onScroll = () => { if (performance.now() > pausedUntil - 3900) pos = el.scrollLeft; };
    const stops = ['pointerdown', 'touchstart', 'wheel', 'mouseenter', 'focusin'];
    const stop = () => hold();
    stops.forEach((e) => el.addEventListener(e, stop, { passive: true }));
    const leave = () => hold(1200);
    el.addEventListener('mouseleave', leave, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      (entries) => { visible = entries.some((e) => e.isIntersecting); }, { threshold: 0.2 });
    if (io) io.observe(el); else visible = true;
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      stops.forEach((e) => el.removeEventListener(e, stop));
      el.removeEventListener('mouseleave', leave);
      el.removeEventListener('scroll', onScroll);
    };
  }, [ref, reverse, active]);
}

// Rows are fetched one or two at a time. Opening all thirteen at once made the
// supplier throttle us, so rows came back empty and vanished.
const rowQueue = [];
let rowsRunning = 0;
const ROW_PARALLEL = 2;
function enqueueRow(task) {
  rowQueue.push(task);
  pumpRows();
}
function pumpRows() {
  while (rowsRunning < ROW_PARALLEL && rowQueue.length) {
    const next = rowQueue.shift();
    rowsRunning += 1;
    next().finally(() => { rowsRunning -= 1; pumpRows(); });
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRow(keyword, isCancelled) {
  const base = `/api/products?keyword=${encodeURIComponent(keyword)}&page=1&limit=${ROW_SIZE}`;
  // Up to three tries, each a little later, the later ones past any cached copy.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (isCancelled()) return null;
    try {
      const r = await fetch(attempt ? `${base}&_=${Date.now()}` : base);
      if (r.ok) {
        const d = await r.json();
        if (d?.products?.length) return d.products;
      }
    } catch { /* try again */ }
    await wait(1500 * (attempt + 1));
  }
  return [];
}

/**
 * A titled, sideways-scrolling row of one category's products. It fetches only
 * once it comes near the screen, so thirteen rows don't fire thirteen searches
 * at once. A row that cannot load keeps its place with a Try again button
 * rather than disappearing.
 */
function CategoryRow({ cat, index = 0, onAdd, onViewAll }) {
  const ref = useRef(null);
  const trackRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', items: [] });
  const [attempt, setAttempt] = useState(0);
  // Neighbouring rows drift in opposite directions, so the page feels alive.
  useDrift(trackRef, { reverse: index % 2 === 1, active: state.status === 'ready' });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let cancelled = false;
    const load = () => {
      setState((s) => (s.status === 'ready' ? s : { status: 'loading', items: [] }));
      enqueueRow(async () => {
        const items = await fetchRow(cat.keyword, () => cancelled);
        if (cancelled || items === null) return;
        setState({ status: items.length ? 'ready' : 'failed', items });
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => { cancelled = true; };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        load();
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [cat.keyword, attempt]);

  return (
    <section className="section cat-row" ref={ref} aria-label={cat.label}>
      <div className="feed-head">
        <h2 className="feed-title">{cat.label}</h2>
        <button type="button" className="view-all" onClick={() => onViewAll(cat)}>
          View All <span aria-hidden="true">›</span>
        </button>
      </div>
      {state.status === 'failed' ? (
        <p className="row-failed">
          Couldn&apos;t load these right now.{' '}
          <button type="button" onClick={() => { setState({ status: 'idle', items: [] }); setAttempt((n) => n + 1); }}>
            Try again
          </button>
        </p>
      ) : (
        <div className="hscroll" ref={trackRef} aria-busy={state.status !== 'ready'}>
          {state.status === 'ready'
            ? state.items.map((p) => <ProductCard key={p.id} p={p} onAdd={onAdd} />)
            : Array.from({ length: 5 }).map((_, i) => (
              <div className="pc pc-skeleton" key={i}><div className="pc-media" /><i /><i /></div>
            ))}
        </div>
      )}
    </section>
  );
}

export default function HomeClient({ initial = null }) {
  // Real supplier product imagery for the category tiles, fetched once.
  const [catImages, setCatImages] = useState({});
  // A trending product picture for the hero banner, from the same request.
  const [heroImage, setHeroImage] = useState(null);
  // keyword is what is typed; query is what was submitted. Empty query means
  // the default view: whatever AliExpress ranks as best selling.
  // The submitted search lives in the URL (/?q=shoes) rather than in memory, so
  // opening a product and pressing Back returns to the same results.
  const query = useSyncExternalStore(subscribeUrl, readQuery, serverQuery).trim();
  const [keyword, setKeyword] = useState(query);
  const feed = useFeed(query, query ? null : initial);
  const [recent, setRecent] = useState([]);
  const [focused, setFocused] = useState(false);
  const scrollRestored = useRef(false);
  const jumpToResults = useRef(false);

  // Load the history of whoever is signed in, and switch it when they change.
  const { data: session, status: authStatus } = useSession();
  const ownerId = session?.user?.id || null;
  useEffect(() => {
    if (authStatus === 'loading') return;
    recentOwner = ownerId;
    try { localStorage.removeItem('mse_recent_searches'); } catch { /* old shared list */ }
    setRecent(readRecent());
  }, [ownerId, authStatus]);
  useEffect(() => { setKeyword(query); }, [query]);

  const remember = (q) => {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
    writeRecent(next);
    setRecent(next);
  };
  const forget = (q) => {
    const next = readRecent().filter((x) => x !== q);
    writeRecent(next);
    setRecent(next);
  };
  const clearRecent = () => { writeRecent([]); setRecent([]); };

  const runSearch = (q) => {
    const clean = q.trim();
    if (clean) remember(clean);
    if (clean) track('Search', { search_string: clean });
    setKeyword(clean);
    setFocused(false);
    scrollRestored.current = true; // a new search starts at the top
    jumpToResults.current = true;
    window.history.pushState(null, '', clean ? `/?q=${encodeURIComponent(clean)}` : '/');
    window.dispatchEvent(new Event('mse:url'));
  };
  const rowRef = useRef(null);

  const { add, setOpen } = useCart();
  const router = useRouter();

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

  const addToCart = (p) => {
    // Without a quoted shipping cost checkout would refuse this item, so let the
    // product page do the quoting rather than put something unbuyable in the cart.
    if (!p.skuId || !p.shipping?.known) {
      router.push(`/product/${p.id}`);
      return;
    }
    add({
      id: p.id,
      name: p.title,
      price: p.priceUGX,
      img: p.image,
      skuId: p.skuId,
      shipUGX: p.shipping?.known ? p.shipping.costUGX : null,
      handlingUGX: p.handlingUGX,
    });
    setOpen(true);
  };

  // Searching for nothing goes back to the best picks.
  const submitSearch = (e) => {
    e.preventDefault();
    runSearch(keyword);
  };

  // Remember where the shopper was when they opened a product, and put them back
  // there when they return, once the list has loaded.
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest?.('a[href^="/product/"]');
      if (!a) return;
      try {
        sessionStorage.setItem('mse_return', JSON.stringify({ q: query, y: window.scrollY, at: Date.now() }));
      } catch { /* storage blocked */ }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [query]);

  useEffect(() => {
    if (scrollRestored.current || feed.loading || feed.items.length === 0) return;
    scrollRestored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem('mse_return') || 'null');
      sessionStorage.removeItem('mse_return');
      if (saved && saved.q === query && Date.now() - saved.at < 30 * 60 * 1000) {
        requestAnimationFrame(() => window.scrollTo(0, saved.y));
      }
    } catch { /* ignore */ }
  }, [feed.loading, feed.items.length, query]);

  // After a category or search is chosen, bring its results to the top of the
  // screen as soon as the address (and so the list) has changed.
  useEffect(() => {
    if (!jumpToResults.current) return;
    jumpToResults.current = false;
    requestAnimationFrame(() => {
      const top = document.getElementById('shop')?.getBoundingClientRect().top;
      if (top !== undefined) window.scrollTo({ top: window.scrollY + top - 70, behavior: 'smooth' });
    });
  }, [query]);

  const pickCategory = (cat) => {
    runSearch(cat.keyword);
  };

  const scrollRow = (dir) =>
    rowRef.current?.scrollBy({ left: dir * rowRef.current.clientWidth * 0.8, behavior: 'smooth' });

  const { items, hasMore, loading, loadingMore, error, loadMore } = feed;
  // Sort by and Filters for search results; each new search starts afresh.
  const [view, setView] = useState(DEFAULT_VIEW);
  useEffect(() => setView(DEFAULT_VIEW), [query]);
  const shownItems = useMemo(() => applyView(items, view), [items, view]);
  const needle = keyword.trim().toLowerCase();
  const shownRecent = recent.filter((r) => !needle || (r.toLowerCase().includes(needle) && r.toLowerCase() !== needle));

  return (
    <>
      {/* The page's H1: what the shop is. Read by search engines and screen
          readers; the hero banner below is what shoppers see. */}
      <h1 className="sr-only">Shop Online. Get Your Orders Delivered to Uganda. You shop. We ship. You smile.</h1>

      {/* ===== Search bar ===== */}
      <div className="top-search">
        <form className="sb" onSubmit={submitSearch} role="search">
          <button type="submit" className="sb-icon" aria-label="Search"><SearchIcon /></button>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search for anything..."
            aria-label="Search products"
            enterKeyHint="search"
            autoComplete="off"
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
        </form>
        {focused && shownRecent.length > 0 && (
          <div className="recent" role="listbox" aria-label="Recent searches">
            <div className="recent-head">
              <span>Recent searches</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearRecent}>Clear all</button>
            </div>
            {shownRecent.map((r) => (
              <div className="recent-row" key={r}>
                <button type="button" className="recent-item" onMouseDown={(e) => e.preventDefault()} onClick={() => runSearch(r)}>
                  <ClockIcon /> <span>{r}</span>
                </button>
                <button type="button" className="recent-x" aria-label={`Remove ${r}`} onMouseDown={(e) => e.preventDefault()} onClick={() => forget(r)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Hero banner (not while looking at search results) ===== */}
      {!query && <section className="section hero2-wrap" aria-label="Offer">
        <div className="hero2">
          <div className="hero2-copy">
            <h2>Top Brands<span>Best Prices</span></h2>
            <p>Fashion · Electronics · Home &amp; More</p>
            <a href="#shop" className="hero2-btn">
              Shop Now
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>
          <div className="hero2-art" aria-hidden="true">
            <i className="hero2-band b1" />
            <i className="hero2-band b2" />
            {heroImage && <img src={thumb(heroImage, 480)} alt="" decoding="async" />}
          </div>
        </div>
      </section>}

      {/* ===== Categories: one row of round icons ===== */}
      <section className="section cat-section" id="categories" aria-label="Categories">
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
                  <img src={thumb(catImages[cat.keyword], 240)} alt="" aria-hidden="true" loading="lazy" decoding="async" />
                )}
              </span>
              <span className="cat-tile-label">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="section promo-wrap"><PromoBanner /></div>

      {/* ===== Best picks / search results ===== */}
      <section className="section feed" id="shop">
        {!query && (
          <div className="feed-head">
            <h2 className="feed-title">Best picks for you</h2>
            <div className="feed-arrows">
              <button type="button" onClick={() => scrollRow(-1)} aria-label="Scroll left">‹</button>
              <button type="button" onClick={() => scrollRow(1)} aria-label="Scroll right">›</button>
            </div>
          </div>
        )}

        {loading && (
          <div className={query ? 'pgrid' : 'hscroll'} aria-busy="true">
            {Array.from({ length: query ? 8 : 5 }).map((_, i) => (
              <div className="pc pc-skeleton" key={i}><div className="pc-media" /><i /><i /></div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="shop-status error">
            <strong>{error.error || 'Could not load products'}</strong>
            {error.message && <div className="hint">{error.message}</div>}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="shop-status">No products found for “{query}”. Try another search.</p>
        )}

        {!loading && !error && items.length > 0 && !query && (
          <div className="hscroll" ref={rowRef}>
            {items.map((p, i) => <ProductCard key={p.id} p={p} onAdd={addToCart} eager={i < 3} />)}
            {hasMore && (
              <button type="button" className="hscroll-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : <>See more <span aria-hidden="true">→</span></>}
              </button>
            )}
          </div>
        )}

        {!loading && !error && items.length > 0 && query && (
          <>
            <SortFilter view={view} onChange={setView} shown={shownItems.length} total={items.length} hasMore={hasMore} />

            {shownItems.length > 0 ? (
              <div className="pgrid">
                {shownItems.map((p, i) => <ProductCard key={p.id} p={p} onAdd={addToCart} eager={i < 4} />)}
              </div>
            ) : (
              <p className="shop-status">
                No loaded products match these filters.{' '}
                <button type="button" className="sf-link" onClick={() => setView({ ...DEFAULT_VIEW, sort: view.sort })}>Clear filters</button>
              </p>
            )}

            {hasMore ? (
              <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'View More'}
              </button>
            ) : (
              <p className="shop-status">You’ve reached the end of the results for “{query}”.</p>
            )}
          </>
        )}
      </section>

      {/* ===== One product row per category ===== */}
      {CATEGORIES.map((cat, i) => (
        <CategoryRow key={cat.keyword} cat={cat} index={i} onAdd={addToCart} onViewAll={pickCategory} />
      ))}

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
