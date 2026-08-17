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
      return [...prev, { id: item.id, name: item.name, price: item.price, img: item.img, qty }];
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    setItems((prev) =>
      qty <= 0 ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, qty } : c))
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, c) => s + c.qty, 0);
  const total = items.reduce((s, c) => s + c.qty * c.price, 0);

  return (
    <CartCtx.Provider value={{ items, add, setQty, clear, count, total, open, setOpen }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
