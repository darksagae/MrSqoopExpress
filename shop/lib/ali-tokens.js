import { getSql } from './db.js';

/**
 * Durable OAuth token store.
 *
 * AliExpress rotates the refresh token on every refresh: the old one is burned
 * the moment a new pair is issued. Keeping tokens in env vars or in module
 * memory therefore guarantees an eventual outage — the instance that refreshed
 * holds the only valid pair, and the next cold start reads a consumed token
 * from the environment and can never recover without a human re-authorizing.
 *
 * So the current pair lives in Postgres, shared by every instance, and every
 * refresh writes back before the new token is used.
 */

const PROVIDER = 'aliexpress';

// Refresh this far ahead of the real expiry. A request must never be the thing
// that discovers the token died.
export const REFRESH_MARGIN_MS = 60 * 60 * 1000; // 1 hour

// How long one instance may hold the right to refresh before another retries.
// Bounded so a crashed refresher cannot wedge the store shut.
const LOCK_SECONDS = 90;

// Per-instance memo so a burst of API calls doesn't hit Postgres each time.
// Deliberately short: correctness comes from the DB, this is only a cushion.
const MEMO_MS = 30_000;
let memo = { row: null, at: 0 };

export async function initTokenSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      provider           TEXT PRIMARY KEY,
      access_token       TEXT        NOT NULL,
      refresh_token      TEXT,
      access_expires_at  TIMESTAMPTZ,
      refresh_expires_at TIMESTAMPTZ,
      refresh_lock_until TIMESTAMPTZ,
      last_refresh_at    TIMESTAMPTZ,
      last_error         TEXT,
      needs_reauth       BOOLEAN     NOT NULL DEFAULT false,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Added after the table shipped, so bring existing deployments along.
  await sql`ALTER TABLE oauth_tokens ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT false`;
  return true;
}

/** Current stored pair, or null. `fresh` bypasses the per-instance memo. */
export async function readTokens({ fresh = false } = {}) {
  if (!fresh && memo.row && Date.now() - memo.at < MEMO_MS) return memo.row;
  const sql = getSql();
  const rows = await sql`SELECT * FROM oauth_tokens WHERE provider = ${PROVIDER}`;
  memo = { row: rows[0] || null, at: Date.now() };
  return memo.row;
}

/**
 * Persist a freshly issued pair. Called before the new access token is used,
 * so a crash between issue and use cannot strand the rotated refresh token.
 */
export async function writeTokens({ accessToken, refreshToken, accessExpiresAt, refreshExpiresAt }) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO oauth_tokens
      (provider, access_token, refresh_token, access_expires_at, refresh_expires_at,
       last_refresh_at, last_error, needs_reauth, refresh_lock_until, updated_at)
    VALUES
      (${PROVIDER}, ${accessToken}, ${refreshToken || null}, ${accessExpiresAt || null},
       ${refreshExpiresAt || null}, now(), NULL, false, NULL, now())
    ON CONFLICT (provider) DO UPDATE SET
      access_token       = EXCLUDED.access_token,
      -- A response without a refresh token must not erase the one we hold.
      refresh_token      = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
      access_expires_at  = EXCLUDED.access_expires_at,
      refresh_expires_at = COALESCE(EXCLUDED.refresh_expires_at, oauth_tokens.refresh_expires_at),
      last_refresh_at    = now(),
      last_error         = NULL,
      needs_reauth       = false,
      refresh_lock_until = NULL,
      updated_at         = now()
    RETURNING *
  `;
  memo = { row: rows[0], at: Date.now() };
  return rows[0];
}

/**
 * Try to become the single instance that refreshes.
 *
 * Neon's HTTP driver is stateless, so session-scoped advisory locks are not
 * available; this is a lease instead. Returns the row on success, null when
 * another instance already holds it — in which case the caller waits and
 * re-reads rather than burning a second refresh and rotating the winner out.
 */
export async function claimRefresh() {
  const sql = getSql();
  const rows = await sql`
    UPDATE oauth_tokens
       SET refresh_lock_until = now() + make_interval(secs => ${LOCK_SECONDS})
     WHERE provider = ${PROVIDER}
       AND (refresh_lock_until IS NULL OR refresh_lock_until < now())
    RETURNING *
  `;
  if (rows.length) memo = { row: rows[0], at: Date.now() };
  return rows[0] || null;
}

/**
 * A refresh token AliExpress has rejected outright. This is the one failure no
 * amount of retrying fixes: the grant is gone, and only a human re-authorizing
 * in a browser can issue a new one. Distinguishing it from a transient network
 * blip is what lets monitoring say "the shop is down" instead of "try again".
 */
const FATAL_REFRESH_ERROR = /IllegalRefreshToken|invalid_grant|refresh token[^.]*(invalid|expire)/i;

/** Record a failed refresh and drop the lease so the next attempt can proceed. */
export async function recordRefreshFailure(message) {
  const text = String(message);
  const fatal = FATAL_REFRESH_ERROR.test(text);
  const sql = getSql();
  await sql`
    UPDATE oauth_tokens
       SET last_error = ${text.slice(0, 500)},
           -- Sticky once set: cleared only by a successful token write.
           needs_reauth = ${fatal} OR needs_reauth,
           refresh_lock_until = NULL,
           updated_at = now()
     WHERE provider = ${PROVIDER}
  `;
  memo = { row: null, at: 0 };
  return fatal;
}

export function invalidateMemo() {
  memo = { row: null, at: 0 };
}

/** True when the access token is gone or close enough to expiry to renew now. */
export function needsRefresh(row, marginMs = REFRESH_MARGIN_MS) {
  if (!row || !row.access_token) return true;
  if (!row.access_expires_at) return false; // unknown expiry — only refresh on rejection
  return new Date(row.access_expires_at).getTime() - Date.now() <= marginMs;
}
