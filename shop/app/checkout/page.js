'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCart } from '../cart';
import { CUSTOMER_DESTINATION_LABEL } from '@/lib/shipping-destination';
import { detectNetwork } from '@/lib/payments/networks';
import { contentId, track } from '@/lib/meta-pixel';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');

// Hand the browser to the hosted card page with the server-signed fields.
function postToCardPage(endpoint, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = endpoint;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function CheckoutPage() {
  const { items, subtotal, shipping, shippingKnown, handling, total, clear, reprice } = useCart();

  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  // Checking out needs an account, so orders always belong to someone.
  useEffect(() => {
    if (authStatus === 'unauthenticated') router.replace('/login?next=/checkout');
  }, [authStatus, router]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState(null);
  const [touchedNetwork, setTouchedNetwork] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  // Provider outcome once the customer acts on the prompt: PENDING until they
  // approve, then SUCCESSFUL / FAILED / REJECTED, or TIMEOUT if we stop waiting.
  const [payStatus, setPayStatus] = useState(null);
  // The network's reason when it turned the payment down, in plain words.
  const [payReason, setPayReason] = useState(null);
  // Card through Absa's payment link: the customer has pressed "I've paid".
  const [cardClaimed, setCardClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const isCardLink = done?.mode === 'link';
  // How card payment works right now (see /api/settings/public); Bank Card is
  // only offered when it can actually be paid.
  const [cardMode, setCardMode] = useState(null);
  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => setCardMode(d?.card || null))
      .catch(() => setCardMode(null));
  }, []);

  // Get the exact AliExpress price and Uganda shipping for the quantities in the
  // basket before the customer pays, so the total they see is the total charged.
  const quoteKey = items.map((c) => `${c.id}:${c.skuId}:${c.qty}`).join('|');
  const [quoteError, setQuoteError] = useState(null);
  // Promo code: what is typed, what was applied, and the server's verdict.
  const [promoInput, setPromoInput] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [promo, setPromo] = useState(null); // { code, discountUGX }
  const [promoMsg, setPromoMsg] = useState(null);
  const [promoBusy, setPromoBusy] = useState(false);
  useEffect(() => {
    if (authStatus !== 'authenticated' || !items.length) return undefined;
    let stale = false;
    setQuoteError(null);
    if (appliedCode) setPromoBusy(true);
    fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((c) => ({ id: c.id, skuId: c.skuId, qty: c.qty, name: c.name, img: c.img })),
        promoCode: appliedCode || undefined,
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (stale) return;
        if (!ok) { setQuoteError(d.error); return; }
        reprice(d.items);
        if (d.promo) {
          setPromo(d.promo);
          setPromoMsg({ ok: true, text: `${d.promo.code} applied: ${fmt(d.promo.discountUGX)} off your order.` });
        } else {
          setPromo(null);
          if (appliedCode) {
            setAppliedCode('');
            setPromoMsg({ ok: false, text: d.promoError || 'That promo code is not valid.' });
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!stale) setPromoBusy(false); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, authStatus, appliedCode]);

  const applyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoMsg(null);
    if (code === appliedCode) return;
    setAppliedCode(code);
  };
  const removePromo = () => {
    setAppliedCode('');
    setPromo(null);
    setPromoInput('');
    setPromoMsg(null);
  };
  // What the customer actually pays, after the promo.
  const payTotal = total - (promo?.discountUGX || 0);

  // Meta ads tracking: what is in the order, kept from the moment Pay is
  // pressed because the cart empties once the payment lands.
  const ordered = useRef(null);
  const tracked = useRef({ checkout: false, purchase: false });
  const orderContents = () => ({
    content_ids: items.map((c) => contentId(c.id)),
    contents: items.map((c) => ({ id: contentId(c.id), quantity: Number(c.qty) || 1, item_price: Number(c.price) || 0 })),
    content_type: 'product',
    num_items: items.reduce((n, c) => n + (Number(c.qty) || 0), 0),
    currency: 'UGX',
  });
  useEffect(() => {
    if (tracked.current.checkout || authStatus !== 'authenticated' || !items.length) return;
    tracked.current.checkout = true;
    track('InitiateCheckout', { ...orderContents(), value: payTotal });
    // Once per visit to the checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, items.length]);
  // "3 items", or "3 items, 2 products" when one product is bought more than once.
  const itemCount = items.reduce((n, c) => n + (Number(c.qty) || 0), 0);
  const countLabel =
    `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` +
    (items.length !== itemCount ? `, ${items.length} ${items.length === 1 ? 'product' : 'products'}` : '');

  // Start the name from the account, still editable (the payer may differ).
  useEffect(() => {
    if (session?.user?.name) setName((n) => n || session.user.name);
  }, [session]);

  // Auto-detect network from the phone number until the user picks manually.
  useEffect(() => {
    if (touchedNetwork) return;
    const g = detectNetwork(phone);
    if (g) setNetwork(g);
  }, [phone, touchedNetwork]);

  // Poll the provider until the payment settles. Callbacks alone aren't enough:
  // MTN sends one and never retries, so without this a dropped callback would
  // leave the customer staring at "waiting" indefinitely.
  useEffect(() => {
    if (!done?.reference || !done?.network) return;
    if (payStatus && payStatus !== 'PENDING') return;
    // A card-link payment is checked by the admin; start watching once the
    // customer says they've paid, and keep watching for longer.
    if (done.mode === 'link' && !cardClaimed) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = done.mode === 'link' ? 200 : 40; // ~20 min at 6s, ~2 min at 3s
    const GAP_MS = done.mode === 'link' ? 6000 : 3000;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(
          `/api/orders/status?network=${done.network}&reference=${encodeURIComponent(done.reference)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.settled) {
          setPayReason(data.reason || null);
          setPayStatus(data.status);
          if (data.paid) clear();
          return;
        }
        if (res.ok) setPayStatus(data.status || 'PENDING');
      } catch {
        // Transient network trouble — keep polling until the attempt budget runs out.
      }
      if (!cancelled) {
        if (attempts >= MAX_ATTEMPTS) setPayStatus('TIMEOUT');
        else setTimeout(tick, GAP_MS);
      }
    };

    tick();
    return () => { cancelled = true; };
  }, [done, payStatus, clear, cardClaimed]);

  const claimCardPayment = async () => {
    setClaiming(true);
    try {
      await fetch('/api/payments/card/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: done.orderId }),
      });
    } catch {
      // The admin still sees the order; the flag only puts it first in the list.
    }
    setCardClaimed(true);
    setClaiming(false);
  };

  const copyAmount = async () => {
    try {
      await navigator.clipboard.writeText(String(done.amountUGX));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the amount is on screen to type.
    }
  };

  // Purchase, once, when the payment is confirmed. The order number is the
  // event ID, so the server's copy of the same purchase (lib/meta-capi.js) is
  // counted once. Test orders are never reported.
  useEffect(() => {
    if (payStatus !== 'SUCCESSFUL' || !done || done.test || tracked.current.purchase) return;
    tracked.current.purchase = true;
    track('Purchase', { ...(ordered.current || {}), value: Number(done.amountUGX) || 0, currency: 'UGX' }, { eventId: done.orderId });
  }, [payStatus, done]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) return setError('Please enter your name and phone number.');
    if (!network) return setError('Please choose MTN Mobile Money, Airtel Money or Bank Card.');
    // Charging a total that omits an unquoted shipping leg would undercharge the
    // customer now and leave the cost unrecoverable after the money has moved.
    if (!shippingKnown)
      return setError(
        'Shipping for one of your items could not be priced. Please remove it and try again.'
      );

    setSubmitting(true);
    ordered.current = orderContents();
    track('AddPaymentInfo', { ...ordered.current, value: payTotal });

    if (network === 'card') {
      try {
        const res = await fetch('/api/payments/card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: { name: name.trim(), phone: phone.trim() },
            items,
            total: payTotal,
            promoCode: promo?.code,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'PRICE_CHANGED' && data.items) { reprice(data.items); setPromo(data.promo || null); }
          if (data.code === 'PROMO_INVALID') { removePromo(); }
          setError(data.error);
          setSubmitting(false);
          return;
        }
        // Absa's payment link: show the exact amount and the link, here.
        if (data.mode === 'link') {
          setDone(data);
          setSubmitting(false);
          return;
        }
        // Leave the button in its busy state while the browser navigates away.
        postToCardPage(data.endpoint, data.fields);
      } catch (err) {
        setError('Network error — please try again. ' + err.message);
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name: name.trim(), phone: phone.trim() },
          network,
          items,
          total: payTotal,
          promoCode: promo?.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'PRICE_CHANGED' && data.items) { reprice(data.items); setPromo(data.promo || null); }
        if (data.code === 'PROMO_INVALID') removePromo();
        if (data.code === 'NETWORK_MISMATCH' && data.network) setNetwork(data.network);
        setError(data.error);
        return;
      }
      // Keep the cart until the money actually lands — if the customer declines
      // the prompt or it times out, they need their items to retry.
      setDone(data);
    } catch (err) {
      setError('Network error — please try again. ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Request accepted by the provider. Whether it was *paid* is a separate
  // question, answered by the poll above — don't claim success before then.
  if (done && isCardLink && !cardClaimed) {
    return (
      <div className="co-done co-cardlink">
        <div className="co-done-check">💳</div>
        <h1>Pay by Card</h1>
        <p className="co-order-id">Order {done.orderId}</p>
        <p>On the secure card payment page, pay this exact amount:</p>
        <div className="co-pay-amount">
          <span>{fmt(done.amountUGX)}</span>
          <button type="button" onClick={() => void copyAmount()}>{copied ? 'Copied ✓' : 'Copy amount'}</button>
        </div>
        <ol className="co-pay-steps">
          <li>Tap <strong>Copy amount</strong>.</li>
          <li>Tap <strong>Open card payment</strong>. It opens in a new tab.</li>
          <li>Paste the amount into the amount box, so it is exactly <strong>{String(done.amountUGX)}</strong>.</li>
          <li>Pay with your Visa or Mastercard, then come back here and tap <strong>I’ve paid</strong>.</li>
        </ol>
        <div className="co-done-actions">
          <a href={done.payLink} target="_blank" rel="noopener noreferrer" className="btn-dark co-continue">
            Open card payment
          </a>
          <button type="button" className="co-continue co-continue-alt" disabled={claiming} onClick={() => void claimCardPayment()}>
            {claiming ? 'One moment…' : 'I’ve paid'}
          </button>
        </div>
        <p className="co-muted">
          Your order goes ahead once we see a payment of exactly {fmt(done.amountUGX)}. A different
          amount can’t be matched to your order.
        </p>
      </div>
    );
  }

  if (done) {
    const paid = payStatus === 'SUCCESSFUL';
    const rejected = payStatus === 'FAILED' || payStatus === 'REJECTED';
    const waiting = !payStatus || payStatus === 'PENDING';

    return (
      <div className="co-done">
        <div className="co-done-check">{paid ? '✓' : rejected ? '×' : '⏳'}</div>
        <h1>
          {paid
            ? done.test ? 'Test Order Placed' : 'Payment Received'
            : rejected ? 'Payment Not Completed' : isCardLink ? 'Confirming Your Card Payment' : 'Waiting for Your Approval'}
        </h1>
        <p className="co-order-id">Order {done.orderId}</p>

        {waiting && !isCardLink && (
          <>
            <p>{done.message}</p>
            <p className="co-muted">
              Keep this page open — it updates by itself once you approve the prompt.
            </p>
          </>
        )}
        {waiting && isCardLink && (
          <>
            <p>Thank you. We’re checking for your payment of {fmt(done.amountUGX)}.</p>
            <p className="co-muted">
              This usually takes a few minutes during working hours. Keep this page open, or we’ll
              email you once it’s confirmed. Please don’t pay again.
            </p>
          </>
        )}

        {paid && (
          <>
            <p>
              {done.test
                ? 'Test order: no payment was taken. It has gone to the admin for confirmation.'
                : 'Your payment is confirmed and your order is being prepared.'}
            </p>
            <p className="co-muted">Delivering to {CUSTOMER_DESTINATION_LABEL}.</p>
          </>
        )}

        {rejected && (
          <>
            <p>The payment was not completed, so your order hasn’t been placed.</p>
            {payReason && <p>{payReason}</p>}
            <p className="co-muted">
              {isCardLink ? 'Your items are still in your cart.' : 'Nothing has been charged. You can try again from your cart.'}
            </p>
          </>
        )}

        {payStatus === 'TIMEOUT' && isCardLink && (
          <>
            <p>We’re still checking for your card payment of {fmt(done.amountUGX)}.</p>
            <p className="co-muted">We’ll email you once it’s confirmed. Please don’t pay again.</p>
          </>
        )}
        {payStatus === 'TIMEOUT' && !isCardLink && (
          <>
            <p>We haven’t heard back from your network yet.</p>
            <p className="co-muted">
              If you approved the prompt, your payment may still go through — we’ll email you once
              it settles. Don’t pay twice.
            </p>
          </>
        )}

        <div className="co-done-actions">
          {!rejected && (
            <a
              href={`https://mrsqoopexpress.com/?order=${encodeURIComponent(done.orderId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-dark co-continue"
            >
              Track your order
            </a>
          )}
          <Link href="/#shop" className={`co-continue ${rejected ? 'btn-dark' : 'co-continue-alt'}`}>
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  if (authStatus !== 'authenticated') {
    return <div className="co-empty"><p>{authStatus === 'loading' ? 'Loading…' : 'Redirecting to log in…'}</p></div>;
  }

  if (!items.length) {
    return (
      <div className="co-empty">
        <h1>Your cart is empty</h1>
        <Link href="/#shop" className="btn-dark">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="co">
      <h1 className="co-title">Checkout</h1>
      <div className="co-grid">
        {/* Payment form */}
        <form className="co-form" onSubmit={submit}>
          {quoteError && <div className="co-error">{quoteError}</div>}
          <h2 className="co-h2">Your details</h2>

          <label className="co-field">
            <span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina Nakato" />
          </label>

          <label className="co-field">
            <span>{network === 'card' ? 'Phone number' : 'Mobile money phone number'}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0772 123456"
              inputMode="tel"
            />
          </label>

          <h2 className="co-h2">Pay with</h2>
          <div className="co-methods">
            <button
              type="button"
              className={`co-method ${network === 'mtn' ? 'active' : ''}`}
              onClick={() => { setNetwork('mtn'); setTouchedNetwork(true); }}
            >
              <span className="co-method-badge mtn">MTN</span>
              <span>MTN Mobile Money</span>
            </button>
            <button
              type="button"
              className={`co-method ${network === 'airtel' ? 'active' : ''}`}
              onClick={() => { setNetwork('airtel'); setTouchedNetwork(true); }}
            >
              <span className="co-method-badge airtel">Airtel</span>
              <span>Airtel Money</span>
            </button>
            {cardMode && <button
              type="button"
              className={`co-method ${network === 'card' ? 'active' : ''}`}
              onClick={() => { setNetwork('card'); setTouchedNetwork(true); }}
            >
              <span className="co-method-badge card">VISA / MC</span>
              <span>Bank Card</span>
            </button>}
          </div>

          <p className="co-note">
            {network === 'card'
              ? 'Pay with any Visa or Mastercard. You’ll enter your card details on a secure payment page — we never see or store your card number.'
              : 'When you place the order, a payment prompt is sent to your phone. Approve it with your mobile-money PIN to confirm.'}
          </p>

          {error && <div className="co-error">{error}</div>}

          <button className="btn-dark co-pay" disabled={submitting}>
            {submitting
              ? network === 'card' ? 'Opening card payment…' : 'Sending prompt…'
              : `Pay ${fmt(payTotal)}`}
          </button>
        </form>

        {/* Order summary */}
        <aside className="co-summary">
          <h2 className="co-h2">
            Order summary <span className="co-count">({countLabel})</span>
          </h2>
          <div className="co-items">
            {items.map((c) => (
              <div className="co-item" key={`${c.id}:${c.skuId}`}>
                <img src={c.img} alt="" />
                <div className="co-item-info">
                  <div className="co-item-name">{c.name}</div>
                  <div className="co-item-meta">
                    Qty {c.qty} · {fmt(c.price)}
                    {c.shipUGX == null
                      ? ' · shipping TBC'
                      : c.shipUGX === 0
                        ? ' · express shipping'
                        : ` · +${fmt(c.shipUGX)} shipping`}
                  </div>
                </div>
                <div className="co-item-line">{fmt(c.price * c.qty)}</div>
              </div>
            ))}
          </div>
          <div className="co-summary-row"><span>Subtotal ({countLabel})</span><span>{fmt(subtotal)}</span></div>
          {/* AliExpress prices shipping per product, so this is the sum of the
              individual quotes rather than one flat delivery fee. */}
          <div className="co-summary-row">
            <span>Shipping to {CUSTOMER_DESTINATION_LABEL}</span>
            <span>
              {!shippingKnown ? 'Calculated at checkout' : shipping === 0 ? `Free — ${fmt(0)}` : fmt(shipping)}
            </span>
          </div>
          {/* The rate itself is not disclosed — only the amount it comes to. */}
          {handling > 0 && (
            <div className="co-summary-row">
              <span>Handling</span>
              <span>{fmt(handling)}</span>
            </div>
          )}
          {promo && (
            <div className="co-summary-row co-promo-line">
              <span>Promo {promo.code}</span>
              <span>−{fmt(promo.discountUGX)}</span>
            </div>
          )}
          <div className="co-summary-row total"><span>Total</span><span>{fmt(payTotal)}</span></div>

          <div className="co-promo">
            {promo ? (
              <div className="co-promo-applied">
                <span>Code <strong>{promo.code}</strong> applied</span>
                <button type="button" onClick={removePromo}>Remove</button>
              </div>
            ) : (
              <div className="co-promo-row">
                <input
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                  placeholder="Promo code"
                  aria-label="Promo code"
                  autoCapitalize="characters"
                />
                <button type="button" onClick={applyPromo} disabled={promoBusy || !promoInput.trim()}>
                  {promoBusy ? 'Checking…' : 'Apply'}
                </button>
              </div>
            )}
            {promoMsg && <p className={promoMsg.ok ? 'co-promo-ok' : 'co-promo-err'}>{promoMsg.text}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
