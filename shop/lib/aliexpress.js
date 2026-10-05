import crypto from 'crypto';
import {
  readTokens,
  writeTokens,
  claimRefresh,
  recordRefreshFailure,
  needsRefresh,
} from './ali-tokens.js';
// Catalogue and freight queries are quoted against the customer's country —
// that is what the shopper is shown and charged. Where the goods are actually
// routed is a separate, internal matter.
import { CUSTOMER_DESTINATION } from './shipping-destination.js';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AliExpressDS {
  constructor() {
    this.appKey = process.env.NEXT_PUBLIC_ALIEXPRESS_APP_KEY;
    this.appSecret = process.env.ALIEXPRESS_APP_SECRET;
  }

  /**
   * Whether the app credentials are present. Deliberately *not* "do we hold a
   * usable token" — that is a database question, so it cannot be answered
   * synchronously, and a sync method that returned a Promise would read as
   * truthy even when the answer was no.
   */
  hasCredentials() {
    return Boolean(this.appKey && this.appSecret);
  }

  /** Explains what's missing, for clear error messages. */
  missingConfig() {
    const missing = [];
    if (!this.appKey) missing.push('NEXT_PUBLIC_ALIEXPRESS_APP_KEY');
    if (!this.appSecret) missing.push('ALIEXPRESS_APP_SECRET');
    return missing;
  }

  /**
   * A valid access token, renewed ahead of expiry rather than after a failure.
   *
   * The store is the source of truth, not the environment. ALIEXPRESS_ACCESS_TOKEN
   * is consulted once, to seed an empty table on first deploy; after that every
   * instance reads and writes the same row. That is the whole point — AliExpress
   * burns the old refresh token each time it issues a new pair, so a refresh held
   * only in one instance's memory silently invalidates every other instance.
   */
  async getAccessToken({ force = false } = {}) {
    let row = await readTokens({ fresh: force });
    if (!row) row = await this.seedFromEnv();

    if (!row) {
      const err = new Error(
        'AliExpress is not authorized yet — visit /api/auth/aliexpress to connect the account.'
      );
      err.code = 'NOT_AUTHORIZED';
      throw err;
    }

    if (force || needsRefresh(row)) row = await this.refreshTokens(row);

    if (!row?.access_token) {
      const err = new Error('AliExpress token store holds no usable access token.');
      err.code = 'NOT_AUTHORIZED';
      throw err;
    }
    return row.access_token;
  }

  /** One-time migration of env-var tokens into the store. */
  async seedFromEnv() {
    const accessToken = process.env.ALIEXPRESS_ACCESS_TOKEN || '';
    const refreshToken = process.env.ALIEXPRESS_REFRESH_TOKEN || null;
    if (!accessToken && !refreshToken) return null;

    console.log('[aliexpress] seeding token store from environment (one-time)');
    // Expiry is unknown for an env-seeded token, so it is left null: renew on
    // rejection rather than on a guessed schedule.
    return writeTokens({ accessToken, refreshToken, accessExpiresAt: null, refreshExpiresAt: null });
  }

  /**
   * Renew the pair, single-flight across instances.
   *
   * Two concurrent refreshes would each rotate the other's refresh token out and
   * break the chain permanently, so whoever wins the lease makes the call and
   * everyone else waits and re-reads the result.
   */
  async refreshTokens(current) {
    const claimed = await claimRefresh();
    if (!claimed) {
      await sleep(2000);
      const row = await readTokens({ fresh: true });
      return row?.access_token ? row : current;
    }

    const refreshToken = claimed.refresh_token || current?.refresh_token;
    if (!refreshToken) {
      await recordRefreshFailure('no refresh token stored');
      const err = new Error(
        'AliExpress refresh token is missing — re-authorize at /api/auth/aliexpress.'
      );
      err.code = 'NOT_AUTHORIZED';
      throw err;
    }

    let resp;
    try {
      resp = await this.restCall('/auth/token/refresh', { refresh_token: refreshToken });
    } catch (e) {
      await recordRefreshFailure(e.message);
      throw e;
    }

    const parsed = parseTokenResponse(resp);
    if (!parsed.accessToken) {
      const detail =
        resp?.error_description || resp?.error_msg || resp?.error || JSON.stringify(resp).slice(0, 300);
      await recordRefreshFailure(detail);
      const err = new Error(`AliExpress token refresh failed: ${detail}`);
      err.code = 'REFRESH_FAILED';
      throw err;
    }

    // Stored before the new token is handed out. A crash in between would
    // otherwise strand the rotated refresh token and take the shop offline
    // until a human re-authorized.
    return writeTokens(parsed);
  }

  /** Renew now regardless of remaining lifetime. Used by the keep-alive cron. */
  async forceRefresh() {
    const row = (await readTokens({ fresh: true })) || (await this.seedFromEnv());
    if (!row) {
      const err = new Error('Nothing to refresh — AliExpress has never been authorized.');
      err.code = 'NOT_AUTHORIZED';
      throw err;
    }
    return this.refreshTokens(row);
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
    if (!this.hasCredentials()) {
      const err = new Error(
        `AliExpress DS API not configured. Missing: ${this.missingConfig().join(', ')}`
      );
      err.code = 'NOT_CONFIGURED';
      throw err;
    }

    // On the retry pass, force a renewal — the token we just used was rejected,
    // so re-reading the same cached value would fail identically.
    const accessToken = await this.getAccessToken({ force: _retried });

    const params = {
      app_key: this.appKey,
      method,
      access_token: accessToken,
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

      // Renew once and retry. Proactive refresh should normally prevent this,
      // but a token can also be revoked server-side at any moment.
      if (tokenExpired && !_retried) {
        console.warn('[aliexpress] access token rejected — forcing refresh and retrying once');
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
  async searchProducts({
    keyword,
    page = 1,
    pageSize = 20,
    countryCode = CUSTOMER_DESTINATION.countryCode,
    currency = 'USD',
    locale = 'en_US',
    sort,
  }) {
    const resp = await this.call('aliexpress.ds.text.search', {
      keyWord: keyword,
      pageIndex: page,
      pageSize,
      countryCode,
      currency,
      local: locale,
      ...(sort ? { sort } : {}),
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

  /**
   * Names of the curated product feeds this app can read (e.g. best sellers).
   * The set differs per merchant account, so it is discovered rather than assumed.
   */
  async getFeedNames() {
    const resp = await this.call('aliexpress.ds.feedname.get', {});
    return deepCollect(resp, (o) => o.promo_name || o.feed_name)
      .map((o) => String(o.promo_name || o.feed_name))
      .filter((n, i, all) => all.indexOf(n) === i);
  }

  /** Products from one of AliExpress's own curated feeds, already ranked by AliExpress. */
  async recommendFeed({
    feedName,
    page = 1,
    pageSize = 20,
    country = CUSTOMER_DESTINATION.countryCode,
    currency = 'USD',
    language = 'en',
    categoryId,
    sort,
  }) {
    const resp = await this.call('aliexpress.ds.recommend.feed.get', {
      feed_name: feedName,
      page_no: page,
      page_size: pageSize,
      country,
      ship_to_country: country,
      target_currency: currency,
      target_language: language,
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(sort ? { sort } : {}),
    });
    return deepCollect(resp, (o) => o.product_id || o.itemId).map(normalizeProduct);
  }

  /** Full product detail by id — returns a normalized detail object. */
  async getProduct({ productId, countryCode = CUSTOMER_DESTINATION.countryCode, currency = 'USD', locale = 'en' }) {
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
  async queryFreight({
    productId,
    skuId,
    quantity = 1,
    country = CUSTOMER_DESTINATION.countryCode,
    currency = 'USD',
    locale = 'en_US',
  }) {
    const req = {
      quantity,
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
    const result = body?.result || {};
    const opts = asArray(result?.delivery_options?.delivery_option_d_t_o);

    // AliExpress answers "this seller does not ship to that country" with a
    // success:false envelope (commonly DELIVERY_NOT_AVAILABLE_TO_YOUR_ADDRESS),
    // not an error. That is a real, useful answer and must not be reported the
    // same way as a lookup that failed — one means the product cannot be sold to
    // this destination, the other means try again.
    const failed = result.success === false;
    const reason = failed ? result.msg || `code ${result.code}` : null;
    // Only a real "we do not ship there" is a refusal. AliExpress also answers
    // success:false for its own hiccups (DELIVERY_SERVICE_EXCEPTION, throttling),
    // which say nothing about the product. Treating those as "undeliverable"
    // hid sellable products at random, so they are thrown as errors instead:
    // the caller sees "unknown", and nothing is cached.
    const refused = failed && /NOT_AVAILABLE|NOT_SUPPORT|NOT_SHIP|UNREACHABLE|CANNOT_BE_DELIVERED/i.test(reason);
    if (failed && !refused) {
      const err = new Error(`Freight temporarily unavailable: ${reason}`);
      err.code = 'FREIGHT_TEMPORARY';
      throw err;
    }

    // Prefer a free option; otherwise the cheapest paid option. The cost is shown
    // to the customer as shipping to Uganda, exactly as AliExpress quoted it.
    const free = opts.find((o) => o.free_shipping) || null;
    const priced = opts
      .map((o) => ({ opt: o, cost: freightCostUSD(o) }))
      .filter((x) => x.cost != null);
    const cheapest = priced.length
      ? priced.reduce((a, b) => (b.cost < a.cost ? b : a))
      : null;

    const chosen = free || cheapest?.opt || opts[0] || null;

    // "No cost field" and "free" are different answers and must not collapse
    // into the same one: quoting 0 for a shipment AliExpress never priced would
    // silently hand the customer a discount we then have to pay for.
    const shippingCostUSD = free ? 0 : cheapest ? cheapest.cost : null;

    return {
      // Answered by AliExpress, one way or the other.
      quoted: true,
      deliverable: !refused && opts.length > 0,
      reason,
      available: opts.length > 0,
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

  /**
   * Exchange an authorization code for a token pair and persist it. Storing it
   * here is what makes the authorization stick — the operator no longer has to
   * copy a token into an env var, which is the step that used to expire.
   */
  async exchangeCodeForToken(code) {
    const resp = await this.restCall('/auth/token/create', { code });
    const parsed = parseTokenResponse(resp);
    if (parsed.accessToken) await writeTokens(parsed);
    return { resp, parsed, stored: Boolean(parsed.accessToken) };
  }
}

/**
 * Normalize a token response. AliExpress is inconsistent about where the pair
 * sits and how expiry is expressed — sometimes a lifetime in seconds, sometimes
 * an absolute epoch-millisecond timestamp — so both forms are accepted.
 */
function parseTokenResponse(resp = {}) {
  const d = resp.data || resp;
  return {
    accessToken: d.access_token || null,
    refreshToken: d.refresh_token || null,
    accessExpiresAt: toExpiry(d.expire_time ?? d.expires_in),
    refreshExpiresAt: toExpiry(d.refresh_token_valid_time ?? d.refresh_expires_in),
  };
}

// Anything this large is an absolute epoch-millisecond timestamp rather than a
// lifetime in seconds — no OAuth token lasts thirty thousand years.
const EPOCH_MS_THRESHOLD = 1e12;

function toExpiry(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n >= EPOCH_MS_THRESHOLD ? n : Date.now() + n * 1000);
}

/** Map a raw AliExpress product object to our internal shape. */
function normalizeProduct(p) {
  // Field names per aliexpress.ds.text.search response.
  const priceUSD = parseFloat(
    p.targetSalePrice ?? p.target_sale_price ?? p.salePrice ?? p.sale_price ?? 0
  );
  const id = (p.itemId ?? p.product_id ?? p.productId ?? '').toString();
  const skuId = extractSkuId(p);
  let url = p.itemUrl ?? p.product_detail_url ?? p.promotion_link ?? null;
  if (url && url.startsWith('//')) url = `https:${url}`;

  // Display-only extras. None of these affect what is charged; they only dress
  // the listing, so every one of them is allowed to be missing.
  const originalUSD = parseFloat(
    p.targetOriginalPrice ?? p.target_original_price ?? p.originalPrice ?? p.original_price ?? 0
  );
  const explicitDiscount = parseFloat(String(p.discount ?? p.discountRate ?? '').replace('%', ''));
  const derivedDiscount =
    originalUSD > priceUSD && priceUSD > 0 ? Math.round((1 - priceUSD / originalUSD) * 100) : 0;
  const discountPct = Number.isFinite(explicitDiscount) && explicitDiscount > 0 && explicitDiscount < 100
    ? Math.round(explicitDiscount)
    : derivedDiscount;

  const score = parseFloat(p.score ?? p.evaluateScore ?? '');
  const ratePct = parseFloat(String(p.evaluateRate ?? p.evaluate_rate ?? '').replace('%', ''));
  const rating =
    Number.isFinite(score) && score > 0 && score <= 5
      ? Math.round(score * 10) / 10
      : Number.isFinite(ratePct) && ratePct > 0 && ratePct <= 100
        ? Math.round((ratePct / 20) * 10) / 10
        : null;

  const soldRaw = String(p.orders ?? p.lastest_volume ?? p.latest_volume ?? p.sales ?? '').replace(/,/g, '');
  const soldNum = parseFloat(soldRaw);
  const sold = Number.isFinite(soldNum) && soldNum > 0
    ? Math.round(/k$/i.test(soldRaw) ? soldNum * 1000 : soldNum)
    : null;

  return {
    id,
    skuId,
    title: p.title ?? p.product_title ?? p.subject ?? 'Untitled product',
    priceUSD: Number.isFinite(priceUSD) ? priceUSD : 0,
    image: p.itemMainPic ?? p.product_main_image_url ?? p.image_url ?? null,
    url: url ?? (id ? `https://www.aliexpress.com/item/${id}.html` : null),
    currency: p.targetOriginalPriceCurrency ?? 'USD',
    originalUSD: Number.isFinite(originalUSD) && originalUSD > priceUSD ? originalUSD : null,
    discountPct: discountPct > 0 ? discountPct : null,
    rating,
    sold,
  };
}

/** Every object anywhere in a response that satisfies the test, outermost first. */
function deepCollect(node, test, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => deepCollect(n, test, out));
  } else if (node && typeof node === 'object') {
    if (test(node)) out.push(node);
    else Object.values(node).forEach((v) => deepCollect(v, test, out));
  }
  return out;
}

/**
 * The SKU a search result was priced for.
 *
 * Freight is quoted per SKU, and the search response has no SKU field — but the
 * item URL it returns carries the exact variant it priced. Without pulling it
 * out of there the catalogue could not show shipping at all, only the detail
 * page could.
 */
function extractSkuId(p) {
  const direct = p.skuId ?? p.sku_id ?? p.selectedSkuId;
  if (direct) return String(direct);
  const raw = String(p.itemUrl ?? p.product_detail_url ?? '');
  const m = raw.match(/[?&]skuId=(\d+)/);
  return m ? m[1] : null;
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
  // The display string ("US $11.84") is the figure AliExpress shows its own
  // shoppers. Prefer it: shipping_fee_cent is misnamed and arrives in whole
  // currency units ("11.84"), not cents — dividing it by 100 under-charged
  // every shipment by 100x.
  const shown = o.shipping_fee_format ?? o.shippingFeeFormat;
  if (shown) {
    const n = parseFloat(String(shown).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  const units = o.shipping_fee_cent ?? o.shippingFeeCent;
  if (units != null && units !== '') {
    const n = parseFloat(units);
    if (Number.isFinite(n)) return n;
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
