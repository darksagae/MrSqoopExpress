import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';

const MARKUP = parseFloat(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE || '35');
const RATE = parseFloat(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE || '3700');
const toUGX = (usd) => Math.round((Number(usd) || 0) * (1 + MARKUP / 100) * RATE);

/**
 * GET /api/products/:id
 * Full product detail (gallery, variants, specs, description, store) from
 * AliExpress, with your markup applied and prices converted to UGX.
 */
export async function GET(request, { params }) {
  const { id } = await params;

  if (!aliexpressDS.isConfigured()) {
    return NextResponse.json(
      { error: 'AliExpress Dropshipping API is not connected.', missing: aliexpressDS.missingConfig() },
      { status: 503 }
    );
  }

  try {
    const d = await aliexpressDS.getProduct({ productId: id });

    // Query freight so we can FOLD any shipping cost into the price. The
    // customer only ever sees one all-inclusive price — no shipping/tax line.
    let shipping = null;
    const firstSku = d.variants[0]?.skuId;
    if (firstSku) {
      try {
        shipping = await aliexpressDS.queryFreight({ productId: d.id, skuId: firstSku });
      } catch (e) {
        console.warn('Freight query failed:', e.message);
      }
    }

    // Cost to bake into the item price (0 for AliExpress Choice / free items).
    const shipUSD = shipping?.shippingCostUSD || 0;

    const variants = d.variants.map((v) => ({
      skuId: v.skuId,
      label: v.label,
      image: v.image,
      stock: v.stock,
      priceUGX: toUGX(v.priceUSD + shipUSD),
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
        priceUGX: toUGX(d.minPriceUSD + shipUSD),
        maxPriceUGX: toUGX(d.maxPriceUSD + shipUSD),
        currency: 'UGX',
        variants,
        specs: d.specs,
        store: d.store,
        // Delivery timing only — never the cost (it's already in the price).
        delivery: shipping
          ? { minDays: shipping.minDays, maxDays: shipping.maxDays, desc: shipping.deliveryDesc }
          : (d.deliveryDays ? { desc: d.deliveryDays } : null),
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
