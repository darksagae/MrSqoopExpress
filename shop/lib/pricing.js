import { aliexpressDS } from './aliexpress.js';
import { handlingFee } from './shipping-destination.js';
import { currentSettings, loadSettings } from './settings.js';
import { evaluatePromo } from './promo.js';

/**
 * The one place USD supplier prices become UGX. The catalogue, the product
 * page and checkout all use these, so the price a shopper sees is the price
 * the server charges.
 */
// Rate and markup come from the admin-editable settings (see settings.js), read
// at call time so a change applies without a redeploy.
export const itemUGX = (usd) => {
  const { rate, markupPercent } = currentSettings();
  return Math.round((Number(usd) || 0) * (1 + markupPercent / 100) * rate);
};
// Shipping is a pass-through of what the supplier bills, so no markup.
export const shipUGX = (usd) => Math.round((Number(usd) || 0) * currentSettings().rate);

const MAX_LINES = 30;
const MAX_QTY = 50;

/** A problem with the cart the shopper can fix; message is customer-safe. */
export class CartProblem extends Error {}

// AliExpress answers some freight calls with a passing DELIVERY_SERVICE_EXCEPTION.
// At checkout that must not stop someone paying, so ask a few times.
async function freightWithRetry(args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await aliexpressDS.queryFreight(args);
    } catch (e) {
      if (e.code !== 'FREIGHT_TEMPORARY' || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

async function priceLine(item) {
  const productId = String(item?.id ?? '').split(':')[0];
  const qty = Number(item?.qty);
  if (!/^\d+$/.test(productId) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    throw new CartProblem('Your cart has an invalid item. Please remove it and add it again.');
  }

  const d = await aliexpressDS.getProduct({ productId });
  const variant = item.skuId
    ? d.variants.find((v) => v.skuId === String(item.skuId))
    : d.variants[0];
  const label = String(item.name || d.title || 'An item').slice(0, 60);

  if (!variant || !(variant.priceUSD > 0)) {
    throw new CartProblem(`"${label}" is no longer available. Please remove it from your cart.`);
  }
  const stock = variant.stock == null || variant.stock === '' ? NaN : Number(variant.stock);
  if (Number.isFinite(stock) && stock < qty) {
    throw new CartProblem(
      stock > 0
        ? `Only ${stock} of "${label}" left in stock. Please lower the quantity.`
        : `"${label}" is out of stock. Please remove it from your cart.`
    );
  }

  // Quoted for the quantity actually being bought: AliExpress prices freight by
  // weight and quantity, so one unit's quote times N is not what it will bill.
  const freight = await freightWithRetry({ productId, skuId: variant.skuId, quantity: qty });
  if (!freight.deliverable) {
    throw new CartProblem(`"${label}" can't be delivered to Uganda. Please remove it from your cart.`);
  }
  const shipUSD = freight.freeShipping ? 0 : freight.shippingCostUSD;
  if (shipUSD == null) {
    throw new CartProblem(`Shipping for "${label}" couldn't be priced. Please remove it and try again.`);
  }

  const price = itemUGX(variant.priceUSD);
  const title = variant.label && variant.label !== 'Default' ? `${d.title} (${variant.label})` : d.title;
  return {
    id: String(item.id),
    skuId: variant.skuId,
    name: title || label,
    img: item.img || variant.image || d.images?.[0] || '',
    qty,
    price,
    // Stored per unit (the cart and the admin multiply by qty), derived from the
    // exact total AliExpress quoted for this quantity.
    shipUGX: Math.round(shipUGX(shipUSD) / qty),
    handlingUGX: handlingFee(price),
  };
}

/**
 * Re-price a cart from live supplier data. Never trusts the prices the
 * browser sends; only ids, variants and quantities are taken from it.
 *
 * @throws {CartProblem} when an item can't be sold as requested
 * @returns {{ lines: object[], total: number }}
 */
export async function priceCart(items, { promoCode } = {}) {
  await loadSettings();
  if (!Array.isArray(items) || !items.length) throw new CartProblem('Your cart is empty.');
  if (items.length > MAX_LINES) throw new CartProblem('Your cart has too many items for one order.');

  const lines = await Promise.all(items.map(priceLine));
  const before = lines.reduce((s, l) => s + l.qty * (l.price + l.shipUGX + l.handlingUGX), 0);
  const goods = lines.reduce((s, l) => s + l.qty * l.price, 0);

  // A promo code, if one was entered. An entered code that does not apply is an
  // error the shopper must see: silently charging full price after they typed
  // a code would be a nasty surprise.
  let promo = null;
  if (promoCode && String(promoCode).trim()) {
    const r = evaluatePromo(promoCode, { goods, total: before });
    if (!r.ok) {
      const err = new CartProblem(r.error);
      err.code = 'PROMO_INVALID';
      throw err;
    }
    promo = { code: r.code, percent: r.percent, discountUGX: r.discountUGX };
  }
  const total = before - (promo?.discountUGX || 0);
  return { lines, total, subtotalBeforeDiscount: before, promo };
}

/**
 * Shared checkout guard: price the cart, and refuse to charge if the shopper
 * was shown a different total. Returns either { lines, total } or
 * { response } with the JSON body and status to send back.
 */
export async function confirmCartTotal(items, clientTotal, { promoCode } = {}) {
  let priced;
  try {
    priced = await priceCart(items, { promoCode });
  } catch (e) {
    if (e instanceof CartProblem) return { response: { status: 409, body: { error: e.message, code: e.code || 'CART_PROBLEM' } } };
    console.error('[PRICING] could not re-price cart:', e.code, e.message);
    return {
      response: {
        status: 503,
        body: { error: 'We couldn’t confirm current prices right now. Please try again in a moment.' },
      },
    };
  }

  if (Math.round(Number(clientTotal)) !== priced.total) {
    return {
      response: {
        status: 409,
        body: {
          error: 'Some prices changed since you added them to your cart. Please check your new total and press Pay again.',
          code: 'PRICE_CHANGED',
          items: priced.lines,
          total: priced.total,
          promo: priced.promo,
        },
      },
    };
  }
  return priced;
}
