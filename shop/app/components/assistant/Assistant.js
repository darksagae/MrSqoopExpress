'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCart } from '../../cart';
import { createBrain } from './brain';
import { canListen, listen, speak, stopSpeaking, unlockAudio } from './speech';
import './assistant.css';

const POS_KEY = 'mse_assist_pos';
const EDGE = 8; // the launcher never gets closer than this to a screen edge
const DRAG_FROM = 6; // px of movement before a press counts as a drag, not a tap

// The launcher's place, as its distance from the right and bottom edges (the
// way the stylesheet anchors it, so a resize keeps it in the same corner).
const viewport = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
const placeOf = (el) => {
  const r = el.getBoundingClientRect();
  const { w, h } = viewport();
  return { right: w - r.right, bottom: h - r.bottom };
};
function keepOnScreen(pos, el) {
  const { w, h } = viewport();
  const bw = el?.offsetWidth || 56;
  const bh = el?.offsetHeight || 56;
  return {
    right: Math.round(Math.min(Math.max(pos.right, EDGE), Math.max(EDGE, w - bw - EDGE))),
    bottom: Math.round(Math.min(Math.max(pos.bottom, EDGE), Math.max(EDGE, h - bh - EDGE))),
  };
}

const ugx = (n) => 'UGX ' + new Intl.NumberFormat('en-UG').format(Math.round(n));
const compact = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(n));
// Sold counts arrive as numbers (search) or text like "10000+" (product page).
const soldText = (s) => (typeof s === 'number' ? `${compact(s)}+ sold` : s ? `${String(s).replace(/(\d)(?=(\d{3})+\b)/g, '$1,')} sold` : null);
const toCartItem = (p) => ({ id: p.id, name: p.title, price: p.priceUGX, img: p.image || p.images?.[0], skuId: p.skuId, shipUGX: p.shippingUGX, handlingUGX: p.handlingUGX });
const NETWORK = { mtn: 'MTN Mobile Money', airtel: 'Airtel Money' };
const HIDDEN_ON = ['/checkout', '/assist'];
let nextId = 1;

/**
 * Sqoop Assist in the shop: a floating button (the white Mr Sqoop Express
 * logo) that opens a chat panel, or, with `embedded`, the panel inline on its
 * own page (/assist). Finds products, adds them to the cart, orders and pays
 * for the signed-in customer (they approve with their Mobile Money PIN) and
 * tracks orders. Typed or spoken; spoken questions get spoken answers.
 */
export default function Assistant({ embedded = false }) {
  const pathname = usePathname() || '/';
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated';
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const cartApi = useCart();
  const { add, setOpen: setCartOpen } = cartApi;
  // The assistant reads and changes the real cart. React updates it on the next
  // render, so a shadow copy keeps "add, then say what's in the cart" correct.
  const cartRef = useRef(cartApi);
  cartRef.current = cartApi;
  const shadow = useRef(null);
  useEffect(() => {
    shadow.current = null;
  }, [cartApi.items]);
  const nameRef = useRef(null);
  const brain = useMemo(
    () =>
      createBrain({
        signedIn: () => signedInRef.current,
        name: () => nameRef.current,
        cart: {
          items: () => shadow.current || cartRef.current.items,
          add: (p, qty) => {
            const item = toCartItem(p);
            cartRef.current.add(item, qty);
            const list = [...(shadow.current || cartRef.current.items)];
            const i = list.findIndex((c) => c.id === item.id);
            if (i >= 0) list[i] = { ...list[i], qty: list[i].qty + qty };
            else list.push({ ...item, qty });
            shadow.current = list;
          },
          remove: (id) => {
            cartRef.current.setQty(id, 0);
            shadow.current = (shadow.current || cartRef.current.items).filter((c) => c.id !== id);
          },
          clear: () => {
            cartRef.current.clear();
            shadow.current = [];
          },
        },
      }),
    []
  );

  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [added, setAdded] = useState({});
  const [micOk, setMicOk] = useState(false);
  const voiceRef = useRef(false);
  voiceRef.current = voiceOn;
  const stopListening = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  // The floating button can be dragged anywhere and remembers where it was left.
  const launcherRef = useRef(null);
  const gesture = useRef(null);
  const wasDragged = useRef(false);
  const [pos, setPos] = useState(null); // null = the stylesheet's corner
  const [dragging, setDragging] = useState(false);
  const placed = pos !== null;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) setPos({ right: saved.right, bottom: saved.bottom });
    } catch {
      /* no storage, or nothing saved: stay in the corner */
    }
  }, []);

  // A smaller window must not strand the button off-screen.
  useEffect(() => {
    if (!placed || open || embedded) return undefined;
    const fit = () =>
      setPos((p) => {
        if (!p) return p;
        const c = keepOnScreen(p, launcherRef.current);
        return c.right === p.right && c.bottom === p.bottom ? p : c;
      });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [placed, open, embedded]);

  const remember = (p) => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(p));
    } catch {
      /* the button still moves for this visit */
    }
  };
  const onLauncherDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: placeOf(e.currentTarget), moving: false, last: null };
    wasDragged.current = false;
    // Hold the pointer from the start, so a quick flick can't leave the button behind.
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onLauncherMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moving) {
      if (Math.hypot(dx, dy) < DRAG_FROM) return;
      g.moving = true;
      setDragging(true);
    }
    g.last = keepOnScreen({ right: g.from.right - dx, bottom: g.from.bottom - dy }, e.currentTarget);
    setPos(g.last);
  };
  const onLauncherUp = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.moving) return;
    wasDragged.current = true; // the click that follows a drag must not open the chat
    setDragging(false);
    if (g.last) remember(g.last);
  };
  const onLauncherKey = (e) => {
    const step = e.shiftKey ? 48 : 16;
    const by = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!by) return;
    e.preventDefault();
    const from = pos || placeOf(e.currentTarget);
    const next = keepOnScreen({ right: from.right + by[0], bottom: from.bottom + by[1] }, e.currentTarget);
    setPos(next);
    remember(next);
  };
  const openFromLauncher = () => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    unlockAudio();
    setOpen(true);
  };
  // On a big screen the chat opens on the side the button was left on.
  const panelLeft = !embedded && placed && typeof document !== 'undefined' && pos.right > viewport().w / 2 - 40;

  const firstName = session?.user?.name?.split(' ')[0];
  nameRef.current = firstName || null;
  const push = useCallback((m) => setMessages((all) => [...all, { id: nextId++, ...m }]), []);

  // Greet on first open.
  useEffect(() => {
    if (!open || messages.length || status === 'loading') return;
    push({
      role: 'assistant',
      text:
        `Hi${firstName ? ' ' + firstName : ''}! I'm Sqoop, your shopping assistant. ` +
        'I can find products, show prices delivered to Uganda, order for you and track your parcels.',
      chips: ["Today's deals", 'Earbuds under 50k', 'Track my order', 'How long is delivery?', ...(signedIn ? ['My orders'] : [])],
    });
  }, [open, messages.length, status, firstName, signedIn, push]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    // On phones the panel is full screen: keep the page behind it still.
    const small = window.matchMedia('(max-width: 640px)').matches;
    if (small) document.body.style.overflow = 'hidden';
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, embedded]);

  useEffect(() => {
    setMicOk(canListen()); // browser-only, so after hydration
    return () => stopSpeaking();
  }, []);

  const run = useCallback(
    async (fn, userText) => {
      if (userText) push({ role: 'user', text: userText });
      setBusy(true);
      try {
        const r = await fn();
        push({ role: 'assistant', ...r });
        if (voiceRef.current && r.text) speak(r.text);
      } catch {
        push({ role: 'assistant', text: 'Sorry, something went wrong. Please try again.' });
      } finally {
        setBusy(false);
      }
    },
    [push]
  );

  const ask = useCallback((text) => {
    const t = text.trim();
    if (!t || busy) return;
    unlockAudio();
    stopSpeaking();
    run(() => brain.think(t), t);
  }, [brain, busy, run]);

  const submit = (e) => {
    e.preventDefault();
    ask(input);
    setInput('');
  };

  const mic = () => {
    if (listening) return stopListening.current?.();
    unlockAudio();
    stopSpeaking();
    setVoiceOn(true); // a spoken question gets a spoken answer
    setListening(true);
    stopListening.current = listen({
      onText: (t) => ask(t),
      onEnd: () => setListening(false),
    });
  };

  const addToCart = (p) => {
    add(toCartItem(p), 1);
    setAdded((a) => ({ ...a, [p.id]: true }));
  };

  const cartButton = (p) => (
    <button
      type="button"
      className={`sa-cartbtn${added[p.id] ? ' on' : ''}`}
      onClick={() => (added[p.id] ? viewCart() : addToCart(p))}
      aria-label={added[p.id] ? 'Added. View cart' : 'Add to cart'}
      title={added[p.id] ? 'Added. View cart' : 'Add to cart'}
    >
      {added[p.id] ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12l5 5L19 7" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0M12 11v5M9.5 13.5h5" /></svg>
      )}
    </button>
  );
  const buyButton = (p) => (
    <button type="button" className="sa-btn" disabled={busy} onClick={() => run(() => brain.buy(p), `Buy ${p.title}`)}>
      Buy now
    </button>
  );

  const viewCart = () => {
    if (!embedded && window.matchMedia('(max-width: 640px)').matches) setOpen(false);
    setCartOpen(true);
  };

  const closeOnPhone = () => {
    if (!embedded && window.matchMedia('(max-width: 640px)').matches) setOpen(false);
  };

  if (!embedded && HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const last = messages[messages.length - 1];

  const panel = (
    <section className={`sa-panel${embedded ? ' sa-embedded' : ''}${panelLeft ? ' sa-left' : ''}`} role={embedded ? undefined : 'dialog'} aria-label="Sqoop Assist">
      {!embedded && <div className="sa-grab" aria-hidden="true" />}
      <header className="sa-head">
        <img src="/logo-white.png" alt="Mr Sqoop Express" className="sa-logo" />
        <div className="sa-title">
          <b>Sqoop Assist</b>
          <span>{signedIn ? `Shopping for ${firstName || 'you'}` : 'Your shopping assistant'}</span>
        </div>
        <button
          type="button"
          className={`sa-icon${voiceOn ? ' on' : ''}`}
          onClick={() => {
            if (voiceOn) stopSpeaking();
            else unlockAudio();
            setVoiceOn(!voiceOn);
          }}
          aria-label={voiceOn ? 'Turn spoken answers off' : 'Turn spoken answers on'}
          title={voiceOn ? 'Spoken answers on' : 'Spoken answers off'}
        >
          {voiceOn ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
          )}
        </button>
        {!embedded && (
          <button type="button" className="sa-icon" onClick={() => setOpen(false)} aria-label="Close assistant">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </header>

      <div className="sa-log" ref={logRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`sa-row ${m.role}`}>
            {m.text && <div className={`sa-bubble ${m.role}`}>{m.display || m.text}</div>}

            {(m.products?.length || m.product) && (
              <div className="sa-carousel">
                {(m.products || [m.product]).map((p) => (
                  <article key={p.id} className="sa-card">
                    <Link href={`/product/${p.id}`} className="sa-card-img" onClick={closeOnPhone}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      {p.discountPct > 0 && <span className="sa-badge">-{p.discountPct}%</span>}
                    </Link>
                    <div className="sa-card-body">
                      <Link href={`/product/${p.id}`} className="sa-card-title" onClick={closeOnPhone}>{p.title}</Link>
                      {(p.rating || p.sold) && (
                        <div className="sa-meta">
                          {parseFloat(p.rating) > 0 ? <span className="sa-stars">★ {p.rating}</span> : null}
                          {soldText(p.sold) ? <span>{soldText(p.sold)}</span> : null}
                        </div>
                      )}
                      <div className="sa-price">
                        {ugx(p.totalUGX)}
                        {p.originalTotalUGX > p.totalUGX && <s>{ugx(p.originalTotalUGX)}</s>}
                      </div>
                      <div className="sa-ship">{p.freeShipping ? 'Free shipping · ' : ''}Delivered to Uganda</div>
                      <div className="sa-actions">
                        {cartButton(p)}
                        {buyButton(p)}
                      </div>
                    </div>
                  </article>
                ))}
                {m === last && m.hasMore && (
                  <button type="button" className="sa-more" onClick={() => ask('More options')} disabled={busy}>
                    <span>→</span>Show more
                  </button>
                )}
              </div>
            )}

            {m.detail && (
              <div className="sa-sheet sa-detail">
                {m.detail.images?.length > 0 && (
                  <div className="sa-gallery">
                    {m.detail.images.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ))}
                  </div>
                )}
                <Link href={`/product/${m.detail.id}`} className="sa-detail-title" onClick={closeOnPhone}>{m.detail.title}</Link>
                <div className="sa-meta">
                  {parseFloat(m.detail.rating) > 0 ? <span className="sa-stars">★ {m.detail.rating}</span> : null}
                  {m.detail.reviews > 0 ? <span>{new Intl.NumberFormat('en-UG').format(m.detail.reviews)} reviews</span> : null}
                  {soldText(m.detail.sold) ? <span>{soldText(m.detail.sold)}</span> : null}
                </div>
                <div className="sa-breakdown">
                  <div><span>Item</span><span>{ugx(m.detail.priceUGX)}</span></div>
                  <div><span>Handling</span><span>{ugx(m.detail.handlingUGX)}</span></div>
                  <div><span>Shipping to Uganda</span><span>{m.detail.freeShipping ? 'Free' : m.detail.shippingUGX != null ? ugx(m.detail.shippingUGX) : 'At checkout'}</span></div>
                  <div className="sa-total"><span>Total, delivered</span><b>{ugx(m.detail.totalUGX)}</b></div>
                </div>
                {m.detail.minDays && m.detail.maxDays ? <div className="sa-pay">Delivery to Uganda in {m.detail.minDays}–{m.detail.maxDays} working days</div> : null}
                {m.detail.options?.length > 0 && (
                  <div className="sa-options">
                    {m.detail.options.map((o) => <span key={o}>{o}</span>)}
                  </div>
                )}
                {m.detail.specs?.length > 0 && (
                  <dl className="sa-specs">
                    {m.detail.specs.map((sp) => (
                      <div key={sp.name}><dt>{sp.name}</dt><dd>{sp.value}</dd></div>
                    ))}
                  </dl>
                )}
                <div className="sa-actions">
                  {cartButton(m.detail)}
                  {buyButton(m.detail)}
                </div>
              </div>
            )}

            {m.compare?.length > 1 && (
              <div className="sa-sheet sa-compare" style={{ '--cols': m.compare.length }}>
                <div className="sa-cmp-row sa-cmp-head">
                  <span />
                  {m.compare.map((p) => (
                    <Link key={p.id} href={`/product/${p.id}`} onClick={closeOnPhone} className={p.id === m.best ? 'best' : ''}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      <small>{p.title}</small>
                      {p.id === m.best && <em>Best value</em>}
                    </Link>
                  ))}
                </div>
                <div className="sa-cmp-row"><span>Price</span>{m.compare.map((p) => <b key={p.id}>{ugx(p.totalUGX)}</b>)}</div>
                <div className="sa-cmp-row"><span>Rating</span>{m.compare.map((p) => <span key={p.id}>{parseFloat(p.rating) > 0 ? `★ ${p.rating}` : '—'}</span>)}</div>
                <div className="sa-cmp-row"><span>Sold</span>{m.compare.map((p) => <span key={p.id}>{soldText(p.sold)?.replace(' sold', '') || '—'}</span>)}</div>
                <div className="sa-cmp-row"><span>Shipping</span>{m.compare.map((p) => <span key={p.id}>{p.freeShipping ? 'Free' : 'Included'}</span>)}</div>
                <div className="sa-cmp-row sa-cmp-actions"><span />{m.compare.map((p) => <span key={p.id}>{buyButton(p)}</span>)}</div>
              </div>
            )}

            {m.cart?.length > 0 && (
              <div className="sa-sheet">
                <div className="sa-sheet-title">Your cart</div>
                {m.cart.map((c) => (
                  <div key={c.id} className="sa-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.img ? <img src={c.img} alt="" /> : <span className="sa-line-ph" />}
                    <span className="sa-line-name">{c.qty} × {c.name}</span>
                    <span>{ugx(c.qty * ((c.price || 0) + (c.shipUGX || 0) + (c.handlingUGX || 0)))}</span>
                  </div>
                ))}
                <div className="sa-total"><span>Total, delivered to Uganda</span><b>{ugx(m.cartTotal)}</b></div>
                <div className="sa-actions">
                  <button type="button" className="sa-btn ghost" onClick={viewCart}>View cart</button>
                  <Link href="/checkout" className="sa-btn" onClick={closeOnPhone}>Checkout</Link>
                </div>
              </div>
            )}

            {m.links?.length > 0 && (
              <div className="sa-chips">
                {m.links.map((l) => (
                  <a key={l.href} href={l.href} className="sa-chip sa-linkchip" onClick={l.href.startsWith('/') ? closeOnPhone : undefined}>{l.label} ↗</a>
                ))}
              </div>
            )}

            {m.order && (
              <div className="sa-sheet">
                <div className="sa-sheet-title">Your order</div>
                {m.order.lines.map((l, i) => (
                  <div key={i} className="sa-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.img ? <img src={l.img} alt="" /> : <span className="sa-line-ph" />}
                    <span className="sa-line-name">{l.qty} × {l.name}</span>
                    <span>{ugx(l.totalUGX)}</span>
                  </div>
                ))}
                <div className="sa-total"><span>Total, delivered to Uganda</span><b>{ugx(m.order.totalUGX)}</b></div>
                <div className="sa-pay">Pay with {NETWORK[m.order.network]} · {m.order.phone}</div>
                {m === last && brain.mem.pending && (
                  <div className="sa-actions">
                    <button type="button" className="sa-btn ghost" onClick={() => run(async () => brain.cancel(), 'Cancel')}>Cancel</button>
                    <button type="button" className="sa-btn" onClick={() => run(() => brain.confirm(), 'Yes, place my order')}>Place order</button>
                  </div>
                )}
              </div>
            )}

            {m.placed && (
              <div className="sa-sheet sa-placed">
                <div className="sa-phone" aria-hidden="true">📱</div>
                <div>
                  <b>Approve on your phone</b>
                  <p>Order {m.placed.orderId}: enter your Mobile Money PIN to pay {ugx(m.placed.amountUGX)}.</p>
                </div>
              </div>
            )}

            {m.orders?.length > 0 && (
              <div className="sa-sheet">
                {m.orders.map((o) => (
                  <div key={o.id} className="sa-order">
                    <div>
                      <b>{o.id}</b>
                      <span>{o.items.length === 1 && o.items[0].name ? o.items[0].name : `${o.items.length} items`} · {ugx(o.amountUGX)}</span>
                    </div>
                    <em>{o.statusLabel}</em>
                  </div>
                ))}
                <Link href="/account/orders" className="sa-link" onClick={closeOnPhone}>See all orders →</Link>
              </div>
            )}

            {m.signIn && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="sa-btn sa-signin" onClick={closeOnPhone}>
                Sign in to order
              </Link>
            )}

            {m === last && !busy && m.chips?.length > 0 && (
              <div className="sa-chips">
                {m.chips.map((c) => (
                  <button key={c} type="button" className="sa-chip" onClick={() => ask(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="sa-row assistant">
            <div className="sa-bubble assistant sa-typing" aria-label="Sqoop is thinking"><i /><i /><i /></div>
          </div>
        )}
      </div>

      <form className="sa-composer" onSubmit={submit}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? 'Listening…' : 'Ask Sqoop anything…'}
          aria-label="Ask Sqoop"
          autoComplete="off"
        />
        {micOk && (
          <button type="button" className={`sa-mic${listening ? ' on' : ''}`} onClick={mic} aria-label={listening ? 'Stop listening' : 'Speak'}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
        )}
        <button type="submit" className="sa-send" disabled={!input.trim() || busy} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>
      <p className="sa-foot">You approve every payment with your own Mobile Money PIN.</p>
    </section>
  );

  if (embedded) return panel;

  return (
    <>
      {open && <div className="sa-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      {open && panel}
      {!open && (
        <button
          type="button"
          ref={launcherRef}
          className={`sa-launcher${dragging ? ' dragging' : ''}`}
          style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
          onClick={openFromLauncher}
          onPointerDown={onLauncherDown}
          onPointerMove={onLauncherMove}
          onPointerUp={onLauncherUp}
          onPointerCancel={onLauncherUp}
          onKeyDown={onLauncherKey}
          onDragStart={(e) => e.preventDefault()}
          aria-label="Open Sqoop Assist"
          title="Drag to move"
        >
          <img src="/logo-white.png" alt="" draggable={false} />
          <span>Ask Sqoop</span>
        </button>
      )}
    </>
  );
}
