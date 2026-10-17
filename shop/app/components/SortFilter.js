'use client';

import { useState } from 'react';
import { DEFAULT_VIEW, MIN_RATING, PRICE_BANDS, SORTS, activeFilterCount, isDefaultView } from '@/lib/product-view';

const compactUGX = (n) => (n >= 1000000 ? `${n / 1000000}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function priceLabel(view) {
  const { minPrice: lo, maxPrice: hi } = view;
  if (lo && hi) return `UGX ${compactUGX(lo)} – ${compactUGX(hi)}`;
  if (lo) return `Over UGX ${compactUGX(lo)}`;
  return `Under UGX ${compactUGX(hi)}`;
}

/**
 * "Sort by" and "Filters" for a list of products. The parent owns the view and
 * applies it (lib/product-view.js); this only edits it.
 *
 *   shown  how many products pass the filters right now
 *   total  how many are loaded
 */
export default function SortFilter({ view, onChange, shown, total, hasMore }) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(view);
  const set = (patch) => onChange({ ...view, ...patch });
  const hasPrice = Boolean(view.minPrice || view.maxPrice);

  const chips = [
    hasPrice && { key: 'price', label: priceLabel(view), clear: { minPrice: 0, maxPrice: 0 } },
    view.freeShipping && { key: 'free', label: 'Free delivery', clear: { freeShipping: false } },
    view.topRated && { key: 'rated', label: `${MIN_RATING}★ & up`, clear: { topRated: false } },
    view.onSale && { key: 'sale', label: 'On sale', clear: { onSale: false } },
  ].filter(Boolean);

  return (
    <div className="sf">
      <div className="sf-bar">
        <button
          type="button"
          className={`sf-btn${count ? ' on' : ''}`}
          aria-expanded={open}
          aria-controls="sf-panel"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
          {count > 0 && <span className="sf-badge">{count}</span>}
        </button>

        <label className="sf-sort">
          <span>Sort by</span>
          <select value={view.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort by">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {open && (
        <div className="sf-panel" id="sf-panel" role="group" aria-label="Filters">
          <p className="sf-h">Price (UGX)</p>
          <div className="sf-pills">
            {PRICE_BANDS.map((b) => {
              const on = view.minPrice === b.min && view.maxPrice === b.max;
              return (
                <button
                  type="button"
                  key={b.label}
                  className={`sf-pill${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => set(on ? { minPrice: 0, maxPrice: 0 } : { minPrice: b.min, maxPrice: b.max })}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <div className="sf-range">
            <label>
              <span>Min</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1000"
                placeholder="0"
                value={view.minPrice || ''}
                onChange={(e) => set({ minPrice: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <i aria-hidden="true">–</i>
            <label>
              <span>Max</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1000"
                placeholder="Any"
                value={view.maxPrice || ''}
                onChange={(e) => set({ maxPrice: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
          </div>

          <p className="sf-h">Show only</p>
          <div className="sf-pills">
            <button type="button" className={`sf-pill${view.freeShipping ? ' on' : ''}`} aria-pressed={view.freeShipping} onClick={() => set({ freeShipping: !view.freeShipping })}>
              Free delivery
            </button>
            <button type="button" className={`sf-pill${view.topRated ? ' on' : ''}`} aria-pressed={view.topRated} onClick={() => set({ topRated: !view.topRated })}>
              {MIN_RATING}★ &amp; up
            </button>
            <button type="button" className={`sf-pill${view.onSale ? ' on' : ''}`} aria-pressed={view.onSale} onClick={() => set({ onSale: !view.onSale })}>
              On sale
            </button>
          </div>

          <div className="sf-actions">
            {count > 0 && (
              <button type="button" className="sf-clear" onClick={() => onChange({ ...DEFAULT_VIEW, sort: view.sort })}>
                Clear filters
              </button>
            )}
            <button type="button" className="sf-done" onClick={() => setOpen(false)}>
              Show {shown} {shown === 1 ? 'product' : 'products'}
            </button>
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="sf-chips">
          {chips.map((c) => (
            <button type="button" key={c.key} className="sf-chip" onClick={() => set(c.clear)} aria-label={`Remove filter: ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="sf-link" onClick={() => onChange({ ...DEFAULT_VIEW, sort: view.sort })}>Clear all</button>
        </div>
      )}

      {!isDefaultView(view) && (
        <p className="sf-count" aria-live="polite">
          Showing {shown} of {total}{hasMore ? ' loaded' : ''} products
          {count > 0 && hasMore ? '. Filters cover the products loaded so far; tap View More to include others.' : ''}
        </p>
      )}
    </div>
  );
}
