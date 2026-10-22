/**
 * Storefront categories.
 *
 * A "category" here is just a starting keyword for the AliExpress search —
 * we don't maintain a catalogue. The shop sells general goods, not only
 * electronics, so the list spans the range of what actually ships well:
 * gadgets, fashion, home, beauty, fitness, baby, pets, auto, tools, bags
 * and office supplies. Category tiles reuse real product photos from cached listings. Loading
 * icons does not start a separate batch of supplier searches.
 */
export const CATEGORIES = [
  { label: 'Men',                  keyword: 'men jacket hoodie' },
  { label: 'Women',                keyword: 'women dress' },
  { label: 'Shoes',                keyword: 'sneakers shoes' },
  { label: 'Accessories',          keyword: 'fashion accessories handbag' },
  { label: 'Home',                 keyword: 'furniture chair' },
  { label: 'Electronics',          keyword: 'electronic gadgets' },
  { label: 'Phones & Tablets',     keyword: 'smartphone' },
  { label: 'Laptops',              keyword: 'laptop' },
  { label: 'Beauty & Personal Care', keyword: 'beauty products' },
  { label: 'Fitness',              keyword: 'fitness equipment' },
  { label: 'Baby & Kids',          keyword: 'baby toys' },
  { label: 'Pet Supplies',         keyword: 'pet supplies' },
  { label: 'Automotive',           keyword: 'car accessories' },
  { label: 'Tools',                keyword: 'hand tools' },
  { label: 'Bags',                 keyword: 'travel bags' },
  { label: 'Office',               keyword: 'office supplies' },
];

/**
 * Broad, high-traffic search terms used to pull trending products for the
 * homepage hero — deliberately not the CATEGORIES list. A category keyword
 * like "hand tools" always resolves to the same handful of best-sellers, so
 * a hero built from it repeats itself; these are generic enough that the
 * best-seller results shift over time and span many kinds of goods.
 */
export const HERO_TRENDING_KEYWORDS = [
  'best seller',
  'trending gadgets',
  'new arrival 2025',
  'hot sale',
  'top rated',
  'must have',
];

export function categorySlug(category) {
  return category.label.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
