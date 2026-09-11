/**
 * Storefront categories.
 *
 * A "category" here is just a starting keyword for the AliExpress search —
 * we don't maintain a catalogue. Each tile's artwork is the first real
 * product image the API returns for that keyword (see /api/categories);
 * `fallbackImg` is only used while that request is in flight or if it fails,
 * so the strip never renders empty.
 */
export const CATEGORIES = [
  { label: 'Earbuds',    keyword: 'wireless earbuds',     fallbackImg: '/images/float-earbuds.png' },
  { label: 'Headphones', keyword: 'bluetooth headphones', fallbackImg: '/images/float-headphones.png' },
  { label: 'Phones',     keyword: 'smartphone',           fallbackImg: '/images/float-phone.png' },
  { label: 'Watches',    keyword: 'smart watch',          fallbackImg: '/images/float-watch.png' },
  { label: 'Speakers',   keyword: 'bluetooth speaker',    fallbackImg: '/images/float-speaker.png' },
  { label: 'Wi-Fi',      keyword: 'wifi router',          fallbackImg: '/images/wifi-router-ghost.png' },
  { label: 'Fitness',    keyword: 'massage gun',          fallbackImg: '/images/massage-gun-ghost.png' },
  { label: 'Home',       keyword: 'pest repeller',        fallbackImg: '/images/pest-repeller-ghost.png' },
];
