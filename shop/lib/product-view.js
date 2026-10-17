/**
 * Sort and filters for a list of products, applied in the browser to the
 * products already loaded. Pure functions, so the product list and the tests
 * share them.
 *
 * Price is the figure shown on the product card (priceUGX).
 */
export const SORTS = [
  { value: 'best', label: 'Best match' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'sold', label: 'Most sold' },
  { value: 'discount', label: 'Biggest discount' },
];

export const PRICE_BANDS = [
  { label: 'Under 50k', min: 0, max: 50000 },
  { label: '50k – 150k', min: 50000, max: 150000 },
  { label: '150k – 500k', min: 150000, max: 500000 },
  { label: 'Over 500k', min: 500000, max: 0 },
];

export const MIN_RATING = 4;

export const DEFAULT_VIEW = {
  sort: 'best',
  minPrice: 0, // 0 = no lower limit
  maxPrice: 0, // 0 = no upper limit
  freeShipping: false,
  topRated: false,
  onSale: false,
};

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

/** How many filters are switched on (the sort is not a filter). */
export function activeFilterCount(view) {
  return (
    (num(view.minPrice) || num(view.maxPrice) ? 1 : 0) +
    (view.freeShipping ? 1 : 0) +
    (view.topRated ? 1 : 0) +
    (view.onSale ? 1 : 0)
  );
}

export const isDefaultView = (view) => view.sort === 'best' && activeFilterCount(view) === 0;

/** Does one product pass the filters? */
export function passes(p, view) {
  const price = num(p.priceUGX);
  const min = num(view.minPrice);
  const max = num(view.maxPrice);
  if (min && price < min) return false;
  if (max && price > max) return false;
  if (view.freeShipping && !p.shipping?.free) return false;
  if (view.topRated && !(Number(p.rating) >= MIN_RATING)) return false;
  if (view.onSale && !(Number(p.discountPct) > 0)) return false;
  return true;
}

// The value a sort looks at, and which way is "first". A product with no value
// goes last whichever way round the sort is.
const KEYS = {
  price_low: { get: (p) => num(p.priceUGX) || null, dir: 1 },
  price_high: { get: (p) => num(p.priceUGX) || null, dir: -1 },
  rating: { get: (p) => num(p.rating) || null, dir: -1 },
  sold: { get: (p) => num(p.sold) || null, dir: -1 },
  discount: { get: (p) => num(p.discountPct) || null, dir: -1 },
};

/** Filter, then sort. "Best match" keeps the order the products arrived in. */
export function applyView(items, view) {
  const kept = items.filter((p) => passes(p, view));
  const key = KEYS[view.sort];
  if (!key) return kept;
  return kept
    .map((p, i) => ({ p, i, v: key.get(p) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      return (a.v - b.v) * key.dir || a.i - b.i;
    })
    .map((x) => x.p);
}
