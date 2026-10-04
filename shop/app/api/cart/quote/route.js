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
    const { lines, total } = await priceCart(body?.items);
    return NextResponse.json({ items: lines, total }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e instanceof CartProblem) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error('[quote] failed:', e.message);
    return NextResponse.json({ error: 'Could not confirm prices right now.' }, { status: 503 });
  }
}
