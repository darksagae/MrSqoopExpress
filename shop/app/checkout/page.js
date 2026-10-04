'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCart } from '../cart';
import { CUSTOMER_DESTINATION_LABEL } from '@/lib/shipping-destination';
import { detectNetwork } from '@/lib/payments/networks';

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

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~2 min at 3s

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
        else setTimeout(tick, 3000);
      }
    };

    tick();
    return () => { cancelled = true; };
  }, [done, payStatus, clear]);

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

    if (network === 'card') {
      try {
        const res = await fetch('/api/payments/card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: { name: name.trim(), phone: phone.trim() },
            items,
            total,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'PRICE_CHANGED' && data.items) reprice(data.items);
          setError(data.error);
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
          total,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'PRICE_CHANGED' && data.items) reprice(data.items);
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
  if (done) {
    const paid = payStatus === 'SUCCESSFUL';
    const rejected = payStatus === 'FAILED' || payStatus === 'REJECTED';
    const waiting = !payStatus || payStatus === 'PENDING';

    return (
      <div className="co-done">
        <div className="co-done-check">{paid ? '✓' : rejected ? '×' : '⏳'}</div>
        <h1>
          {paid ? 'Payment Received' : rejected ? 'Payment Not Completed' : 'Waiting for Your Approval'}
        </h1>
        <p className="co-order-id">Order {done.orderId}</p>

        {waiting && (
          <>
            <p>{done.message}</p>
            <p className="co-muted">
              Keep this page open — it updates by itself once you approve the prompt.
            </p>
          </>
        )}

        {paid && (
          <>
            <p>Your payment is confirmed and your order is being prepared.</p>
            <p className="co-muted">Delivering to {CUSTOMER_DESTINATION_LABEL}.</p>
          </>
        )}

        {rejected && (
          <>
            <p>The payment was not completed, so your order hasn’t been placed.</p>
            <p className="co-muted">Nothing has been charged. You can try again from your cart.</p>
          </>
        )}

        {payStatus === 'TIMEOUT' && (
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
            <button
              type="button"
              className={`co-method ${network === 'card' ? 'active' : ''}`}
              onClick={() => { setNetwork('card'); setTouchedNetwork(true); }}
            >
              <span className="co-method-badge card">VISA / MC</span>
              <span>Bank Card</span>
            </button>
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
              : `Pay ${fmt(total)}`}
          </button>
        </form>

        {/* Order summary */}
        <aside className="co-summary">
          <h2 className="co-h2">Order summary</h2>
          <div className="co-items">
            {items.map((c) => (
              <div className="co-item" key={c.id}>
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
          <div className="co-summary-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
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
          <div className="co-summary-row total"><span>Total</span><span>{fmt(total)}</span></div>
        </aside>
      </div>
    </div>
  );
}
