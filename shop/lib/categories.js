/**
 * Storefront categories.
 *
 * A "category" here is just a starting keyword for the AliExpress search —
 * we don't maintain a catalogue. The shop sells general goods, not only
 * electronics, so the list spans the range of what actually ships well:
 * gadgets, fashion, home, beauty, fitness, baby, pets, auto, tools, bags
 * and office supplies. Every image on the homepage (category tiles and the
 * hero) is a real product image pulled from the API, so the app ships no
 * bundled product artwork at all. Tiles render an empty placeholder box
 * until /api/categories responds.
 */
export const CATEGORIES = [
  { label: 'Electronics',  keyword: 'electronics gadgets' },
  { label: 'Phones',       keyword: 'phone accessories' },
  { label: 'Fashion',      keyword: 'fashion clothing' },
  { label: 'Home',         keyword: 'kitchen gadgets' },
  { label: 'Beauty',       keyword: 'beauty tools' },
  { label: 'Fitness',      keyword: 'fitness equipment' },
  { label: 'Baby & Kids',  keyword: 'baby toys' },
  { label: 'Pet Supplies', keyword: 'pet supplies' },
  { label: 'Automotive',   keyword: 'car accessories' },
  { label: 'Tools',        keyword: 'hand tools' },
  { label: 'Bags',         keyword: 'travel bags' },
  { label: 'Office',       keyword: 'office supplies' },
];

/** Keyword whose top result is used as the hero image. */
export const HERO_KEYWORD = 'bluetooth headphones';
