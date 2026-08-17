import crypto from 'crypto';

/**
 * AliExpress Dropshipping (DS) API client
 *
 * Gateway:   https://api-sg.aliexpress.com/sync
 * Signing:   sort params by key, concat key+value (no separators),
 *            HMAC-SHA256 with the app secret as key, uppercase hex.
 * Auth:      DS APIs require an OAuth access_token (obtained AFTER your
 *            production app is approved and you complete the auth flow).
 *
 * Docs: https://openservice.aliexpress.com/doc/api.htm
 */

const GATEWAY = process.env.ALIEXPRESS_API_ENDPOINT || 'https://api-sg.aliexpress.com/sync';

// Module-level token cache. Seeded from env, updated in-memory when we refresh.
// (On Vercel this persists within a warm instance; a durable KV store is the
//  next step for surviving cold starts + refresh-token rotation.)
let cachedAccessToken = process.env.ALIEXPRESS_ACCESS_TOKEN || null;
let cachedRefreshToken = process.env.ALIEXPRESS_REFRESH_TOKEN || null;

export class AliExpressDS {
  constructor() {
    this.appKey = process.env.NEXT_PUBLIC_ALIEXPRESS_APP_KEY;
    this.appSecret = process.env.ALIEXPRESS_APP_SECRET;
  }

  get accessToken() {
    return cachedAccessToken;
  }

  /** True only when we have everything needed to make a real DS call. */
  isConfigured() {
    return Boolean(this.appKey && this.appSecret && this.accessToken);
  }

  /** Explains what's missing, for clear error messages. */
  missingConfig() {
    const missing = [];
    if (!this.appKey) missing.push('NEXT_PUBLIC_ALIEXPRESS_APP_KEY');
    if (!this.appSecret) missing.push('ALIEXPRESS_APP_SECRET');
    if (!this.accessToken) missing.push('ALIEXPRESS_ACCESS_TOKEN (OAuth token — obtained after production approval)');
    return missing;
  }

  /** Sign a parameter set per AliExpress rules. */
  sign(params) {
    const base = Object.keys(params)
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('');
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(base, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /** Low-level call to any DS method. Returns parsed JSON or throws. */
  async call(method, businessParams = {}, _retried = false) {
    if (!this.isConfigured()) {
      const err = new Error(
        `AliExpress DS API not configured. Missing: ${this.missingConfig().join(', ')}`
      );
      err.code = 'NOT_CONFIGURED';
      throw err;
    }

    const params = {
      app_key: this.appKey,
      method,
      access_token: this.accessToken,
      timestamp: Date.now().toString(), // ms since epoch
      sign_method: 'sha256',
      format: 'json',
      ...businessParams,
    };
    params.sign = this.sign(params);

    const url = `${GATEWAY}?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url, { method: 'POST' });

    const text = await res.text();

    // AliExpress sometimes returns an HTML maintenance page instead of JSON.
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const err = new Error(
        'AliExpress returned a non-JSON response (likely a maintenance page or an invalid endpoint/credentials).'
      );
      err.code = 'NON_JSON';
      err.raw = text.slice(0, 500);
      throw err;
    }

    // Surface API-level error envelopes.
    if (json.error_response) {
      const e = json.error_response;
      const msg = `${e.msg || ''} ${e.sub_msg || ''}`.toLowerCase();
      const tokenExpired = /token/.test(msg) && /(invalid|expire|expired|illegal)/.test(msg);

      // Auto-refresh once on token expiry, then retry the same call.
      if (tokenExpired && !_retried && cachedRefreshToken) {
        console.warn('Access token rejected — refreshing and retrying once.');
        await this.refreshAccessToken(cachedRefreshToken);
        return this.call(method, businessParams, true);
      }

      const err = new Error(`AliExpress API error: ${e.msg || e.sub_msg || 'unknown'} (code ${e.code})`);
      err.code = 'API_ERROR';
      err.details = e;
      throw err;
    }

    return json;
  }

  /**
   * Keyword product search.
   * Returns a normalized array of { id, title, priceUSD, image, url }.
   */
  async searchProducts({ keyword, page = 1, pageSize = 20, countryCode = 'UG', currency = 'USD', locale = 'en_US' }) {
    const resp = await this.call('aliexpress.ds.text.search', {
      keyWord: keyword,
      pageIndex: page,
      pageSize,
      countryCode,
      currency,
      local: locale,
    });

    // Response shape lives under aliexpress_ds_text_search_response.
    const body =
      resp.aliexpress_ds_text_search_response ||
      resp.result ||
      resp;

    const list =
      body?.data?.products?.selection_search_product ||
      body?.products?.product ||
      body?.products ||
      [];

    return (Array.isArray(list) ? list : []).map(normalizeProduct);
  }

  /** Full product detail by id — returns a normalized detail object. */
  async getProduct({ productId, countryCode = 'UG', currency = 'USD', locale = 'en' }) {
    const resp = await this.call('aliexpress.ds.product.get', {
      product_id: productId,
      ship_to_country: countryCode,
      target_currency: currency,
      target_language: locale,
    });
    const body = resp.aliexpress_ds_product_get_response || resp.result || resp;
    const r = body?.result || body;
    return normalizeDetail(r, productId);
  }

  /**
   * Shipping options for a product+sku to a country. Tells us whether the
   * product qualifies for FREE shipping (AliExpress Choice / Selection).
   */
  async queryFreight({ productId, skuId, country = 'UG', currency = 'USD', locale = 'en_US' }) {
    const req = {
      quantity: 1,
      shipToCountry: country,
      productId: String(productId),
      selectedSkuId: String(skuId),
      language: 'en',
      currency,
      locale,
    };
    const resp = await this.call('aliexpress.ds.freight.query', {
      locale,
      queryDeliveryReq: JSON.stringify(req),
    });
    const body = resp.aliexpress_ds_freight_query_response || resp.result || resp;
    const opts = asArray(body?.result?.delivery_options?.delivery_option_d_t_o);

    // Prefer a free option; otherwise pick the cheapest paid option and fold
    // its cost into the product price so the customer never sees a shipping fee.
    const free = opts.find((o) => o.free_shipping) || null;
    const priced = opts
      .map((o) => ({ opt: o, cost: freightCostUSD(o) }))
      .filter((x) => x.cost != null);
    const cheapest = priced.length
      ? priced.reduce((a, b) => (b.cost < a.cost ? b : a))
      : null;

    const chosen = free || cheapest?.opt || opts[0] || null;
    const shippingCostUSD = free ? 0 : cheapest?.cost ?? 0;

    return {
      freeShipping: Boolean(free),
      shippingCostUSD,
      company: chosen?.company || null,
      minDays: chosen?.min_delivery_days ?? null,
      maxDays: chosen?.max_delivery_days ?? null,
      deliveryDesc: chosen?.delivery_date_desc || null,
    };
  }

  // ---------- OAuth (authorization-code flow) ----------

  /** Build the URL to send the user to for authorization. */
  getAuthorizeUrl(state = 'mrsqoop') {
    const callback = process.env.ALIEXPRESS_CALLBACK_URL;
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      client_id: this.appKey,
      redirect_uri: callback,
      state,
    });
    return `https://api-sg.aliexpress.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Sign for the /rest gateway. Unlike /sync, the API path is prepended
   * to the sorted param string before HMAC-SHA256.
   */
  signRest(path, params) {
    const base =
      path +
      Object.keys(params)
        .sort()
        .map((k) => `${k}${params[k]}`)
        .join('');
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(base, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  /** Low-level POST to a /rest endpoint (used for token create/refresh). */
  async restCall(path, businessParams = {}) {
    const params = {
      app_key: this.appKey,
      timestamp: Date.now().toString(),
      sign_method: 'sha256',
      ...businessParams,
    };
    params.sign = this.signRest(path, params);

    const res = await fetch(`https://api-sg.aliexpress.com/rest${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error('AliExpress returned a non-JSON token response.');
      err.raw = text.slice(0, 500);
      throw err;
    }
  }

  /** Exchange an authorization code for an access token. */
  async exchangeCodeForToken(code) {
    return this.restCall('/auth/token/create', { code });
  }

  /** Use a refresh token to get a fresh access token; updates the cache. */
  async refreshAccessToken(refreshToken) {
    const resp = await this.restCall('/auth/token/refresh', { refresh_token: refreshToken });
    const at = resp.access_token || resp?.data?.access_token;
    const rt = resp.refresh_token || resp?.data?.refresh_token;
    if (at) cachedAccessToken = at;
    if (rt) cachedRefreshToken = rt;
    if (at) console.log('Access token refreshed successfully.');
    return resp;
  }
}

/** Map a raw AliExpress product object to our internal shape. */
function normalizeProduct(p) {
  // Field names per aliexpress.ds.text.search response.
  const priceUSD = parseFloat(
    p.targetSalePrice ?? p.target_sale_price ?? p.salePrice ?? p.sale_price ?? 0
  );
  const id = (p.itemId ?? p.product_id ?? p.productId ?? '').toString();
  let url = p.itemUrl ?? p.product_detail_url ?? p.promotion_link ?? null;
  if (url && url.startsWith('//')) url = `https:${url}`;
  return {
    id,
    title: p.title ?? p.product_title ?? p.subject ?? 'Untitled product',
    priceUSD: Number.isFinite(priceUSD) ? priceUSD : 0,
    image: p.itemMainPic ?? p.product_main_image_url ?? p.image_url ?? null,
    url: url ?? (id ? `https://www.aliexpress.com/item/${id}.html` : null),
    currency: p.targetOriginalPriceCurrency ?? 'USD',
  };
}

/** Map the aliexpress.ds.product.get result into a clean detail object. */
function normalizeDetail(r = {}, productId) {
  const base = r.ae_item_base_info_dto || {};
  const media = r.ae_multimedia_info_dto || {};
  const skus = asArray(r.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o);
  const props = asArray(r.ae_item_properties?.ae_item_property);
  const store = r.ae_store_info || {};
  const logistics = r.logistics_info_dto || {};

  const images = String(media.image_urls || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const variants = skus.map((s) => ({
    skuId: (s.sku_id ?? '').toString(),
    label: skuLabel(s),
    priceUSD: parseFloat(s.offer_sale_price ?? s.sku_price ?? 0) || 0,
    stock: s.sku_available_stock ?? null,
    image: skuImage(s),
  }));

  const priced = variants.map((v) => v.priceUSD).filter((n) => n > 0);
  const minPriceUSD = priced.length ? Math.min(...priced) : 0;
  const maxPriceUSD = priced.length ? Math.max(...priced) : 0;

  const specs = props
    .map((p) => ({ name: p.attr_name, value: p.attr_value }))
    .filter((s) => s.name && s.value);

  return {
    id: (base.product_id ?? productId ?? '').toString(),
    title: base.subject || 'Untitled product',
    images,
    descriptionHtml: base.detail || '',
    rating: base.avg_evaluation_rating || null,
    reviews: base.evaluation_count || null,
    sales: base.sales_count || null,
    minPriceUSD,
    maxPriceUSD,
    variants,
    specs,
    store: {
      name: store.store_name || null,
      country: store.store_country_code || null,
      asDescribedRating: store.item_as_described_rating || null,
      shippingRating: store.shipping_speed_rating || null,
    },
    deliveryDays: logistics.delivery_time ?? null,
    url: base.product_id ? `https://www.aliexpress.com/item/${base.product_id}.html` : null,
  };
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

/**
 * Extract a delivery option's shipping fee in USD (freight is queried with
 * currency=USD). AliExpress uses several field names across versions, so we
 * probe them defensively. Cents fields are divided by 100. Returns null if no
 * cost is present (which we treat as free elsewhere).
 */
function freightCostUSD(o = {}) {
  if (o.free_shipping) return 0;
  const cents = o.shipping_fee_cent ?? o.shippingFeeCent;
  if (cents != null && cents !== '') {
    const n = parseFloat(cents);
    if (Number.isFinite(n)) return n / 100;
  }
  const amount =
    o.shipping_fee ?? o.shippingFee ?? o.shipping_amount ?? o.amount ?? o.fee_amount;
  if (amount != null && amount !== '') {
    const n = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function skuLabel(s) {
  const dtos = asArray(s.ae_sku_property_dtos?.ae_sku_property_d_t_o);
  if (dtos.length) {
    const parts = dtos
      .map((d) => d.sku_property_value || d.property_value_definition_name)
      .filter(Boolean);
    if (parts.length) return parts.join(' / ');
  }
  if (s.sku_attr && s.sku_attr.includes('#')) return s.sku_attr.split('#').pop();
  return s.sku_attr || 'Default';
}

function skuImage(s) {
  const dtos = asArray(s.ae_sku_property_dtos?.ae_sku_property_d_t_o);
  const withImg = dtos.find((d) => d.sku_image);
  return withImg ? withImg.sku_image : null;
}

export const aliexpressDS = new AliExpressDS();
