import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';

// TEMPORARY: raw freight response, to check how shipping cost is encoded.
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const productId = sp.get('productId');
  const d = await aliexpressDS.getProduct({ productId });
  const skuId = sp.get('skuId') || d.variants[0].skuId;
  const req = { quantity: 1, shipToCountry: 'UG', productId, selectedSkuId: skuId, language: 'en', currency: 'USD', locale: 'en_US' };
  const resp = await aliexpressDS.call('aliexpress.ds.freight.query', { locale: 'en_US', queryDeliveryReq: JSON.stringify(req) });
  return NextResponse.json({ skuId, priceUSD: d.variants[0].priceUSD, resp });
}
