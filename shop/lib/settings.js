import crypto from 'crypto';
import { getSql, isDbConfigured } from './db.js';

/**
 * Settings the operator changes from the admin: the USD->UGX rate, the handling
 * fee percentage and the promo banner. They live in the shop's own database so
 * pricing reads them with no cross-site call.
 *
 * Prices are computed by synchronous helpers all over the app, so the current
 * values are held in memory and refreshed from the database at most every
 * 30 seconds by whichever request needs them (`loadSettings`). A database
 * problem never blocks selling: the last good values (or the env defaults) stay
 * in force.
 */
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const DEFAULTS = {
  rate: num(process.env.NEXT_PUBLIC_USD_TO_UGX_RATE, 3700),
  handlingPercent: num(process.env.NEXT_PUBLIC_HANDLING_FEE_PERCENT, 38),
  markupPercent: num(process.env.NEXT_PUBLIC_MARKUP_PERCENTAGE, 0),
  promo: { enabled: false, code: '', text: '', minOrder: 0, discountUGX: 0, endsAt: '' },
  // Bumped whenever the banner image changes; 0 = no image.
  promoImageVersion: 0,
};

let current = structuredClone(DEFAULTS);
let loadedAt = 0;
let tableReady = null;
const TTL_MS = 30_000;

export function currentSettings() {
  return current;
}

function ensureTable(sql) {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS shop_settings (
        key        TEXT PRIMARY KEY,
        value      JSONB       NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

/** Accept only sane values; anything else is dropped rather than stored. */
export function validate(input = {}) {
  const out = {};
  const errors = [];

  if (input.rate !== undefined) {
    const r = Number(input.rate);
    if (Number.isFinite(r) && r >= 100 && r <= 100000) out.rate = r;
    else errors.push('Exchange rate must be between 100 and 100,000 UGX per US$.');
  }
  if (input.handlingPercent !== undefined) {
    const h = Number(input.handlingPercent);
    if (Number.isFinite(h) && h >= 0 && h <= 200) out.handlingPercent = Math.round(h * 100) / 100;
    else errors.push('Handling fee must be between 0 and 200 %.');
  }
  if (input.promo !== undefined) {
    const p = input.promo || {};
    const code = String(p.code ?? '').trim().toUpperCase();
    const text = String(p.text ?? '').trim();
    if (code && !/^[A-Z0-9_.-]{2,30}$/.test(code)) errors.push('Promo code can only use letters, numbers, - _ . (2–30 characters).');
    else if (text.length > 120) errors.push('Promo text can be at most 120 characters.');
    else {
      const min = Number(p.minOrder ?? 0);
      if (!Number.isFinite(min) || min < 0 || min > 100_000_000) errors.push('Minimum order must be a positive amount in UGX (or 0 for none).');
      else {
        const off = Number(p.discountUGX ?? 0);
        const endsAt = String(p.endsAt ?? '').trim();
        if (!Number.isFinite(off) || off < 0 || off > 10_000_000) errors.push('Discount must be an amount in UGX between 0 and 10,000,000.');
        else if (endsAt && !/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) errors.push('End date must be a date like 2026-10-30.');
        else out.promo = {
          enabled: Boolean(p.enabled),
          code,
          text,
          minOrder: Math.round(min),
          discountUGX: Math.round(off),
          endsAt,
        };
      }
    }
  }
  if (input.promoImageVersion !== undefined) {
    const v = Number(input.promoImageVersion);
    if (Number.isInteger(v) && v >= 0) out.promoImageVersion = v;
  }
  return { values: out, errors };
}

function apply(rows) {
  const next = structuredClone(DEFAULTS);
  for (const { key, value } of rows) {
    const { values } = validate({ [key]: value });
    if (key in values) next[key] = values[key];
  }
  current = next;
}

export async function loadSettings({ force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return current;
  if (!isDbConfigured()) return current;
  // Claim the slot first so a burst of requests triggers one read, and a failing
  // database is retried soon rather than on every request.
  loadedAt = Date.now() - (force ? TTL_MS : TTL_MS - 5_000);
  try {
    const sql = getSql();
    await ensureTable(sql);
    apply(await sql`SELECT key, value FROM shop_settings`);
    loadedAt = Date.now();
  } catch (e) {
    console.error('[settings] could not load, keeping current values:', e.message);
  }
  return current;
}

export async function saveSettings(input) {
  const { values, errors } = validate(input);
  if (errors.length) return { ok: false, errors };
  const sql = getSql();
  await ensureTable(sql);
  for (const [key, value] of Object.entries(values)) {
    await sql`
      INSERT INTO shop_settings (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  }
  await loadSettings({ force: true });
  return { ok: true, settings: current };
}

/** Constant-time check of the shared secret the admin site sends. */
export function isSettingsAdmin(request) {
  const secret = process.env.ORDER_INGEST_SECRET;
  const given = request.headers.get('x-ingest-secret') || '';
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}


/* ---------- promo banner image ---------- */

const MAX_IMAGE_BYTES = 900 * 1024;
let assetTable = null;

function ensureAssetTable(sql) {
  if (!assetTable) {
    assetTable = sql`
      CREATE TABLE IF NOT EXISTS shop_assets (
        key          TEXT PRIMARY KEY,
        content_type TEXT        NOT NULL,
        data         BYTEA       NOT NULL,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.catch((e) => { assetTable = null; throw e; });
  }
  return assetTable;
}

/** Recognise the image by its first bytes, never by what the caller claims. */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function savePromoImage(dataUrl) {
  const m = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, error: 'Send the banner as a JPG, PNG or WebP image.' };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, error: 'That image is too large (max 900 KB after resizing).' };
  const type = sniff(buf);
  if (!type) return { ok: false, error: 'That file is not a JPG, PNG or WebP image.' };

  const sql = getSql();
  await ensureAssetTable(sql);
  await sql`
    INSERT INTO shop_assets (key, content_type, data) VALUES ('promo-banner', ${type}, ${buf})
    ON CONFLICT (key) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()
  `;
  const version = Date.now();
  const saved = await saveSettings({ promoImageVersion: version });
  return saved.ok ? { ok: true, version } : { ok: false, error: saved.errors.join(' ') };
}

export async function removePromoImage() {
  const sql = getSql();
  await ensureAssetTable(sql);
  await sql`DELETE FROM shop_assets WHERE key = 'promo-banner'`;
  return saveSettings({ promoImageVersion: 0 });
}

export async function getPromoImage() {
  const sql = getSql();
  await ensureAssetTable(sql);
  const rows = await sql`SELECT content_type, data FROM shop_assets WHERE key = 'promo-banner'`;
  return rows[0] || null;
}
