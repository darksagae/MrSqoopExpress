/**
 * Storefront categories.
 *
 * A "category" here is just a starting keyword for the AliExpress search —
 * we don't maintain a catalogue. The shop sells general goods, not only
 * electronics, so the list spans the range of what actually ships well:
 * gadgets, fashion, home, beauty, fitness, baby, pets, auto, tools, bags
 * and office supplies. Each tile renders a fixed icon (see CategoryIcons.js)
 * rather than a live product photo — a scraped listing image comes with
 * whatever badge or watermark that seller put on it.
 */
export const CATEGORIES = [
  { label: 'Electronics',  keyword: 'electronics gadgets', icon: 'electronics' },
  { label: 'Phones',       keyword: 'phone accessories',   icon: 'phone' },
  { label: 'Fashion',      keyword: 'fashion clothing',    icon: 'fashion' },
  { label: 'Home',         keyword: 'kitchen gadgets',     icon: 'kitchen' },
  { label: 'Beauty',       keyword: 'beauty tools',        icon: 'beauty' },
  { label: 'Fitness',      keyword: 'fitness equipment',   icon: 'fitness' },
  { label: 'Baby & Kids',  keyword: 'baby toys',           icon: 'baby' },
  { label: 'Pet Supplies', keyword: 'pet supplies',        icon: 'pets' },
  { label: 'Automotive',   keyword: 'car accessories',     icon: 'automotive' },
  { label: 'Tools',        keyword: 'hand tools',          icon: 'tools' },
  { label: 'Bags',         keyword: 'travel bags',         icon: 'bags' },
  { label: 'Office',       keyword: 'office supplies',     icon: 'office' },
];

/** Keyword whose top result is used as the hero image. */
export const HERO_KEYWORD = 'bluetooth headphones';
