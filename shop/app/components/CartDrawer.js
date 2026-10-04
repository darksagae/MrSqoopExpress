'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCart } from '../cart';

const fmt = (n) => 'UGX ' + Number(n || 0).toLocaleString('en-US');

export default function CartDrawer() {
  const { items, setQty, total, open, setOpen } = useCart();
  const router = useRouter();
  const { status } = useSession();

  const checkout = () => {
    if (!items.length) return;
    setOpen(false);
    // Signed in: straight to checkout. Otherwise log in (or sign up from there)
    // and come back to checkout with the cart intact.
    router.push(status === 'authenticated' ? '/checkout' : '/login?next=/checkout');
  };

  return (
    <>
      {open && <div className="cart-overlay open" onClick={() => setOpen(false)} />}
      <aside className={`cart-drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Shopping cart">
        <div className="cart-head">
          <h2>Your Cart</h2>
          <button className="cart-close" onClick={() => setOpen(false)} aria-label="Close cart">&times;</button>
        </div>
        {items.length === 0 ? (
          <p className="cart-empty">Your cart is empty.</p>
        ) : (
          <div className="cart-items">
            {items.map((c) => (
              <div className="cart-row" key={c.id}>
                <img src={c.img} alt="" />
                <div className="cart-row-info">
                  <div className="cart-row-name">{c.name}</div>
                  <div className="cart-row-price">{fmt(c.price)}</div>
                  <div className="cart-qty">
                    <button type="button" onClick={() => setQty(c.id, c.qty - 1)}>−</button>
                    <span>{c.qty}</span>
                    <button type="button" onClick={() => setQty(c.id, c.qty + 1)}>+</button>
                  </div>
                </div>
                <button type="button" className="cart-remove" onClick={() => setQty(c.id, 0)}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="cart-foot">
          <div className="cart-total-row">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
          <button className="btn-dark cart-checkout" onClick={checkout}>Checkout</button>
        </div>
      </aside>
    </>
  );
}
