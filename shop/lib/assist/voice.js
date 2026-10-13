/**
 * Turns store data into short sentences that sound natural when Alexa reads them.
 */

const ugx = new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 });

/** "220,498 shillings" reads cleanly in text-to-speech. */
export function shillings(n) {
  return `${ugx.format(Math.round(n))} shillings`;
}

/** AliExpress titles are long keyword lists; keep the first useful part. */
export function shortTitle(title, words = 7) {
  const clean = String(title || '')
    .replace(/[®™]/g, '')
    .split(/[,|(]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const parts = clean.split(' ');
  return parts.length > words ? parts.slice(0, words).join(' ') : clean;
}

/** Item + handling + shipping: the full amount the customer pays. */
export function totalOf(p) {
  return p.totalUGX ?? p.priceUGX + p.handlingUGX + (p.shipping?.costUGX || 0);
}

export function deliveryPhrase(s) {
  if (!s || !s.known) return 'delivery time will be confirmed at checkout';
  if (s.desc) return `it should arrive between ${s.desc.replace(/\./g, '').replace(/\s*-\s*/, ' and ')}`;
  return s.minDays === s.maxDays
    ? `delivery takes about ${s.minDays} working days`
    : `delivery takes ${s.minDays} to ${s.maxDays} working days`;
}
