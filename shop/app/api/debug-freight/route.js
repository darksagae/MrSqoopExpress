import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';

// TEMPORARY: raw freight answer for one product to one country (diagnosing
// Dubai warehouse shipping). Public supplier data only. Remove after use.
export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const productId = sp.get('productId');
  const skuId = sp.get('skuId');
  const country = sp.get('country') || 'AE';
  const extra = sp.get('extra') === '1';
  const req = { quantity: 1, shipToCountry: country, productId, selectedSkuId: skuId, language: 'en', currency: 'USD', locale: 'en_US' };
  if (extra) Object.assign(req, { provinceCode: 'Dubai', cityCode: 'Dubai' });
  try {
    const resp = await aliexpressDS.call('aliexpress.ds.freight.query', { locale: 'en_US', queryDeliveryReq: JSON.stringify(req) });
    return NextResponse.json({ req, resp });
  } catch (e) {
    return NextResponse.json({ req, error: e.message, code: e.code });
  }
}
