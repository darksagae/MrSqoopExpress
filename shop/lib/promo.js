import { currentSettings } from './settings.js';

/**
 * The promo code set in the admin, applied at checkout.
 *
 * The discount comes off the product prices only. Shipping is a pass-through of
 * what AliExpress bills and is paid in full whatever the promo; the handling fee
 * is the shop's own charge and also stays. The minimum order is measured on the
 * full total before the discount, the figure the shopper sees in the cart.
 */
const KAMPALA_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no daylight saving

/** True once the promo's last day (inclusive, Kampala time) has passed. */
export function promoExpired(promo, now = Date.now()) {
  if (!promo?.endsAt) return false;
  const endUtc = Date.parse(`${promo.endsAt}T23:59:59.999Z`) - KAMPALA_OFFSET_MS;
  return Number.isFinite(endUtc) && now > endUtc;
}

/** Whether the shop has a promo customers can actually use right now. */
export function activePromo(settings = currentSettings()) {
  const p = settings.promo;
  if (!p?.enabled || !p.code || !(p.discountPercent > 0) || promoExpired(p)) return null;
  return p;
}

const fmt = (n) => 'UGX ' + Math.round(n).toLocaleString('en-US');

/**
 * @param {string} code      what the shopper typed
 * @param {{ goods: number, total: number }} amounts  before any discount
 * @returns {{ ok: true, code: string, percent: number, discountUGX: number }
 *         | { ok: false, error: string }}
 */
export function evaluatePromo(code, { goods, total }) {
  const typed = String(code || '').trim().toUpperCase();
  if (!typed) return { ok: false, error: 'Enter a promo code.' };

  const p = currentSettings().promo;
  const known = p?.code && typed === p.code;
  if (!known || !p.enabled || !(p.discountPercent > 0)) {
    return { ok: false, error: 'That promo code is not valid.' };
  }
  if (promoExpired(p)) return { ok: false, error: 'That promo code has expired.' };
  if (p.minOrder > 0 && total < p.minOrder) {
    return { ok: false, error: `This code needs an order of at least ${fmt(p.minOrder)}. Add ${fmt(p.minOrder - total)} more to use it.` };
  }
  const discountUGX = Math.round(goods * (p.discountPercent / 100));
  return { ok: true, code: p.code, percent: p.discountPercent, discountUGX };
}
