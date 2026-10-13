import { NextResponse } from 'next/server';
import { isAdminRequest, adminDenied } from '@/lib/admin-auth';
import { aliexpressDS } from '@/lib/aliexpress';
import { SOURCING } from '@/lib/shipping-destination';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/aliexpress/freight-debug?productId=...&skuId=...&country=AE
 *
 * Raw freight response, unparsed. Exists because "shipping unknown" has several
 * very different causes — an API error, an empty option list, or a response
 * shape our parser doesn't recognise — and they are indistinguishable from the
 * normalized output.
 */
export async function GET(request) {
  if (!isAdminRequest(request)) return adminDenied();

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const skuId = searchParams.get('skuId');
  // The warehouse by default, which is what the shop quotes; ?country=UG etc. to compare.
  const country = searchParams.get('country') || SOURCING.countryCode;

  if (!productId || !skuId) {
    return NextResponse.json({ error: 'productId and skuId are required' }, { status: 400 });
  }

  const req = {
    quantity: 1,
    shipToCountry: country,
    productId: String(productId),
    selectedSkuId: String(skuId),
    language: 'en',
    currency: 'USD',
    locale: 'en_US',
    ...(country === SOURCING.countryCode ? { provinceCode: SOURCING.provinceCode, cityCode: SOURCING.cityCode } : {}),
  };

  try {
    const raw = await aliexpressDS.call('aliexpress.ds.freight.query', {
      locale: 'en_US',
      queryDeliveryReq: JSON.stringify(req),
    });
    const parsed = await aliexpressDS.queryFreight({ productId, skuId, country });
    return NextResponse.json({ request: req, parsed, raw });
  } catch (error) {
    return NextResponse.json(
      { request: req, error: error.message, code: error.code, details: error.details },
      { status: 502 }
    );
  }
}
