import { NextResponse } from 'next/server';
import { priceCart, CartProblem } from '@/lib/pricing';

/**
 * POST /api/cart/quote  { items: [{id, skuId, qty}] }
 *
 * Exact live prices for a cart: AliExpress's price, its shipping quote to
 * Uganda for the quantity in the basket, and the handling fee. Checkout shows
 * these before the customer pays, and the charge uses the same code path.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  try {
    const promoCode = body?.promoCode;
    let priced;
    let promoError = null;
    try {
      priced = await priceCart(body?.items, { promoCode });
    } catch (e) {
      // A code that does not apply still gets a normal quote, with the reason.
      if (e?.code !== 'PROMO_INVALID') throw e;
      promoError = e.message;
      priced = await priceCart(body?.items);
    }
    return NextResponse.json(
      { items: priced.lines, total: priced.total, subtotalBeforeDiscount: priced.subtotalBeforeDiscount, promo: priced.promo, promoError },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    if (e instanceof CartProblem) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error('[quote] failed:', e.message);
    return NextResponse.json({ error: 'Could not confirm prices right now.' }, { status: 503 });
  }
}
