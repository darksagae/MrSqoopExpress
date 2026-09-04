import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import {
  CUSTOMER_DESTINATION,
  CUSTOMER_DESTINATION_LABEL,
  HANDLING_FEE_PERCENT,
  handlingFee,
} from '@/lib/shipping-destination';

// No markup by default — the listed price is the AliExpress price.
const MARKUP = parseFloat(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE || '0');
const RATE = parseFloat(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE || '3700');
const toUGX = (usd) => Math.round((Number(usd) || 0) * (1 + MARKUP / 100) * RATE);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * GET /api/products/:id?skuId=...
 *
 * Full product detail with prices exactly as AliExpress lists them for Uganda,
 * the shipping cost to Uganda as its own figure, and the handling fee as
 * another. Three separate numbers, because folding any of them together would
 * make the product price stop matching AliExpress.
 *
 * Shipping is quoted for a specific SKU because AliExpress prices it that way —
 * a heavier or bulkier variant of the same product can ship at a different
 * rate, so the frontend re-requests with ?skuId= when the shopper switches
 * variant rather than showing one quote for all of them.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const requestedSku = searchParams.get('skuId');

  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json(
      { error: 'AliExpress Dropshipping API is not connected.', missing: aliexpressDS.missingConfig() },
      { status: 503 }
    );
  }

  try {
    const d = await aliexpressDS.getProduct({ productId: id });

    // Quote the SKU actually being viewed, falling back to the first variant.
    const quoteSku =
      (requestedSku && d.variants.some((v) => v.skuId === requestedSku) && requestedSku) ||
      d.variants[0]?.skuId;

    let freight = null;
    if (quoteSku) {
      try {
        freight = await aliexpressDS.queryFreight({ productId: d.id, skuId: quoteSku });
      } catch (e) {
        console.warn('Freight query failed:', e.message);
      }
    }

    // Unknown stays unknown: a shipment AliExpress never priced must not be
    // presented as free.
    const shipUSD = freight?.freeShipping ? 0 : freight?.shippingCostUSD ?? null;

    const variants = d.variants.map((v) => ({
      skuId: v.skuId,
      label: v.label,
      image: v.image,
      stock: v.stock,
      priceUSD: round2(v.priceUSD),
      priceUGX: toUGX(v.priceUSD),
      handlingUGX: handlingFee(toUGX(v.priceUSD)),
    }));

    return NextResponse.json({
      success: true,
      product: {
        id: d.id,
        title: d.title,
        images: d.images,
        descriptionHtml: d.descriptionHtml,
        rating: d.rating,
        reviews: d.reviews,
        sales: d.sales,
        // Item price only — shipping is reported separately below.
        priceUSD: round2(d.minPriceUSD),
        priceUGX: toUGX(d.minPriceUSD),
        handlingUGX: handlingFee(toUGX(d.minPriceUSD)),
        maxPriceUSD: round2(d.maxPriceUSD),
        maxPriceUGX: toUGX(d.maxPriceUSD),
        currency: 'UGX',
        variants,
        specs: d.specs,
        store: d.store,
        shipping: {
          quotedForSkuId: quoteSku || null,
          known: shipUSD != null,
          deliverable: freight ? freight.deliverable !== false : null,
          reason: freight?.reason || null,
          free: Boolean(freight?.freeShipping),
          costUSD: shipUSD == null ? null : round2(shipUSD),
          costUGX: shipUSD == null ? null : toUGX(shipUSD),
          company: freight?.company || null,
          minDays: freight?.minDays ?? null,
          maxDays: freight?.maxDays ?? null,
          desc: freight?.deliveryDesc || d.deliveryDays || null,
          destination: CUSTOMER_DESTINATION_LABEL,
        },
        destination: { ...CUSTOMER_DESTINATION, label: CUSTOMER_DESTINATION_LABEL },
        handlingFeePercent: HANDLING_FEE_PERCENT,
      },
    });
  } catch (error) {
    console.error('Product detail fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to load product.', code: error.code || 'UNKNOWN', message: error.message },
      { status: 502 }
    );
  }
}
