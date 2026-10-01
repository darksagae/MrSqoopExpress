import { aliexpressDS } from './aliexpress.js';
import { itemUGX, shipUGX } from './pricing.js';
import { handlingFee } from './shipping-destination.js';

const FREIGHT_CONCURRENCY = 8;
// A slow freight lookup must not hold up the whole listing. Past this, the
// product is returned with shipping unknown rather than not returned at all.
const FREIGHT_TIMEOUT_MS = 6000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * One freight quote per product, run in bounded batches.
 *
 * Every failure mode here degrades to null rather than throwing: a product with
 * an unknown shipping cost is still worth showing, but a listing that 502s
 * because one freight lookup timed out is not.
 */
export async function quoteFreightForAll(products) {
  const results = new Array(products.length).fill(null);

  for (let start = 0; start < products.length; start += FREIGHT_CONCURRENCY) {
    const batch = products.slice(start, start + FREIGHT_CONCURRENCY);
    await Promise.all(
      batch.map(async (p, j) => {
        if (!p.skuId || !p.id) return; // no SKU, nothing to quote against
        try {
          results[start + j] = await withTimeout(
            aliexpressDS.queryFreight({ productId: p.id, skuId: p.skuId }),
            FREIGHT_TIMEOUT_MS
          );
        } catch (e) {
          console.warn(`Freight quote failed for ${p.id}:`, e.message);
        }
      })
    );
  }

  return results;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('freight quote timed out')), ms)),
  ]);
}

/**
 * Turn raw supplier products into what the storefront lists: UGX price, the
 * handling fee and shipping to Uganda as separate figures, plus the display-only
 * rating / sales / discount when the supplier gave them.
 */
export function priceProducts(products, freights) {
  return products.map((p, i) => {
    const f = freights?.[i] ?? null;

    // null means AliExpress never quoted this route — reported as unknown so
    // the UI can say "calculated at checkout" instead of implying free.
    const shipUSD = f?.freeShipping ? 0 : f?.shippingCostUSD ?? null;
    // Refused is a definite "no", not a missing answer.
    const refused = f?.quoted === true && f?.deliverable === false;

    const priceUGX = itemUGX(p.priceUSD);
    // Charged on the product price only. Shipping is a pass-through of what
    // AliExpress bills, so taking a percentage of it too would mean the fee
    // moved with the courier rather than with the goods.
    const handlingUGX = handlingFee(priceUGX);

    return {
      id: p.id,
      skuId: p.skuId,
      title: p.title,
      image: p.image,
      url: p.url,
      // The AliExpress figure itself, untouched.
      priceUSD: round2(p.priceUSD),
      priceUGX,
      handlingUGX,
      // Display only: the crossed-out "was" price, the % off, stars and units sold.
      originalUGX: p.originalUSD ? itemUGX(p.originalUSD) : null,
      discountPct: p.discountPct ?? null,
      rating: p.rating ?? null,
      sold: p.sold ?? null,
      shipping: f
        ? {
            known: shipUSD != null,
            deliverable: !refused,
            reason: f.reason || null,
            free: Boolean(f.freeShipping),
            costUSD: shipUSD == null ? null : round2(shipUSD),
            costUGX: shipUSD == null ? null : shipUGX(shipUSD),
            company: f.company,
            minDays: f.minDays,
            maxDays: f.maxDays,
          }
        : { known: false, deliverable: null, reason: null, free: false, costUSD: null, costUGX: null },
      // Everything the customer pays: product + shipping + handling. Null
      // while shipping is unknown rather than understating the total.
      totalUGX: shipUSD == null ? null : priceUGX + shipUGX(shipUSD) + handlingUGX,
      currency: 'UGX',
    };
  });
}
