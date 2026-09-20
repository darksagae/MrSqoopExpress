/**
 * Storefront categories.
 *
 * A "category" here is just a starting keyword for the AliExpress search —
 * we don't maintain a catalogue. Every image on the homepage (category tiles
 * and the hero) is a real product image pulled from the API, so the app ships
 * no bundled product artwork at all. Tiles render an empty placeholder box
 * until /api/categories responds.
 */
export const CATEGORIES = [
  { label: 'Earbuds',    keyword: 'wireless earbuds' },
  { label: 'Headphones', keyword: 'bluetooth headphones' },
  { label: 'Phones',     keyword: 'smartphone' },
  { label: 'Watches',    keyword: 'smart watch' },
  { label: 'Speakers',   keyword: 'bluetooth speaker' },
  { label: 'Wi-Fi',      keyword: 'wifi router' },
  { label: 'Fitness',    keyword: 'massage gun' },
  { label: 'Home',       keyword: 'pest repeller' },
];

/** Keyword whose top result is used as the hero image. */
export const HERO_KEYWORD = 'bluetooth headphones';
