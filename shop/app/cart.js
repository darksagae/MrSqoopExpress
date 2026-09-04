'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const CartCtx = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem('mse_cart') || '[]')); } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem('mse_cart', JSON.stringify(items)); } catch { /* ignore */ }
  }, [items, loaded]);

  const add = useCallback((item, qty = 1) => {
    setItems((prev) => {
      const i = prev.findIndex((c) => c.id === item.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          price: item.price,
          img: item.img,
          skuId: item.skuId ?? null,
          // Per-unit shipping to Uganda as AliExpress quoted it. null means it
          // was never quoted — which is not the same as free, and is why the
          // totals below refuse to guess.
          shipUGX: item.shipUGX ?? null,
          // Per-unit handling fee, carried on the line so the basket total does
          // not depend on re-deriving a percentage the product was priced with.
          handlingUGX: item.handlingUGX ?? 0,
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    setItems((prev) =>
      qty <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, qty } : c))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, c) => s + c.qty, 0);
  const subtotal = items.reduce((s, c) => s + c.qty * c.price, 0);

  // AliExpress bills shipping per product, not per basket, so it is summed
  // line by line. A single unpriced line makes the shipping total unknown
  // rather than zero — charging nothing for a leg we were never quoted for
  // would mean eating the cost after the sale.
  const shippingKnown = items.every((c) => c.shipUGX != null);
  const shipping = shippingKnown ? items.reduce((s, c) => s + c.qty * c.shipUGX, 0) : null;

  const handling = items.reduce((s, c) => s + c.qty * (c.handlingUGX || 0), 0);

  // What the customer actually pays: goods, shipping, and handling. Falls back
  // to omitting shipping only while it is genuinely unknown — never to hide it.
  const total = (shippingKnown ? subtotal + shipping : subtotal) + handling;

  return (
    <CartCtx.Provider
      value={{
        items, add, setQty, clear, count,
        subtotal, shipping, shippingKnown, handling, total,
        open, setOpen,
      }}
    >
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
