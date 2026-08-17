import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getSql } from './db.js';

/**
 * User accounts for sign-up / sign-in.
 *
 * Two ways in, one table:
 *  - email + password  → password_hash set, provider 'credentials'
 *  - Google            → password_hash null, provider 'google', google_sub set
 *
 * Email is the identity key and is always stored lower-cased so 'A@x.com' and
 * 'a@x.com' can't become two accounts.
 */

const ROUNDS = 10;

export async function initUserSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT,
      email         TEXT        NOT NULL,
      password_hash TEXT,
      image         TEXT,
      provider      TEXT        NOT NULL DEFAULT 'credentials',
      google_sub    TEXT,
      email_verified TIMESTAMPTZ,
      verify_token   TEXT,
      verify_expires TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Add verification columns for pre-existing tables (idempotent).
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified TIMESTAMPTZ`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ`;
  // Case-insensitive uniqueness on email — the account identity.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email))`;
  await sql`CREATE INDEX IF NOT EXISTS users_verify_token_idx ON users (verify_token) WHERE verify_token IS NOT NULL`;
  return true;
}

const norm = (email) => String(email || '').trim().toLowerCase();

export async function getUserByEmail(email) {
  const sql = getSql();
  const rows = await sql`SELECT * FROM users WHERE lower(email) = ${norm(email)} LIMIT 1`;
  return rows[0] || null;
}

/**
 * Create an email+password account. Throws { code: 'EMAIL_TAKEN' } if the email
 * already exists so the API can return a clean 409.
 */
export async function createUser({ name, email, password }) {
  const existing = await getUserByEmail(email);
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.code = 'EMAIL_TAKEN';
    throw err;
  }
  const sql = getSql();
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, ROUNDS);
  const code = genCode();
  const rows = await sql`
    INSERT INTO users (id, name, email, password_hash, provider, verify_token, verify_expires)
    VALUES (${id}, ${name || null}, ${norm(email)}, ${passwordHash}, 'credentials',
            ${code}, now() + interval '1 hour')
    RETURNING id, name, email, image
  `;
  // Return the code so the caller can email it.
  return { ...rows[0], verifyCode: code };
}

/** 6-digit numeric confirmation code. */
function genCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Check a plaintext password against a stored account. */
export async function verifyPassword(user, password) {
  if (!user?.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

/** True once the account's email has been confirmed (Google logins are pre-verified). */
export function isEmailVerified(user) {
  return Boolean(user?.email_verified);
}

/** Issue a fresh confirmation code (used for "resend code"). Returns the code. */
export async function refreshVerifyCode(email) {
  const sql = getSql();
  const code = genCode();
  const rows = await sql`
    UPDATE users
       SET verify_token = ${code}, verify_expires = now() + interval '1 hour', updated_at = now()
     WHERE lower(email) = ${norm(email)} AND email_verified IS NULL
    RETURNING id
  `;
  return rows.length ? code : null;
}

/**
 * Confirm an email from the code entered by the user. Single-use: the code is
 * cleared on success. Matches on email + code so a code can't be used for a
 * different account.
 * @returns {{ ok: boolean, reason?: string }}
 */
export async function verifyEmailCode(email, code) {
  if (!email || !code) return { ok: false, reason: 'missing' };
  const sql = getSql();
  const rows = await sql`
    UPDATE users
       SET email_verified = now(), verify_token = NULL, verify_expires = NULL, updated_at = now()
     WHERE lower(email) = ${norm(email)}
       AND verify_token = ${String(code).trim()}
       AND verify_expires > now()
       AND email_verified IS NULL
    RETURNING id
  `;
  if (rows.length) return { ok: true };
  return { ok: false, reason: 'invalid' };
}

/**
 * Google sign-in: create the account on first login, otherwise refresh basic
 * profile fields. Keyed on email so a person who signed up with a password and
 * later uses Google lands on the same account.
 */
export async function upsertGoogleUser({ email, name, image, googleSub }) {
  const sql = getSql();
  const existing = await getUserByEmail(email);
  if (existing) {
    const rows = await sql`
      UPDATE users
         SET name       = COALESCE(${name || null}, name),
             image      = COALESCE(${image || null}, image),
             google_sub = COALESCE(${googleSub || null}, google_sub),
             email_verified = COALESCE(email_verified, now()),
             updated_at = now()
       WHERE id = ${existing.id}
      RETURNING id, name, email, image
    `;
    return rows[0];
  }
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO users (id, name, email, image, provider, google_sub, email_verified)
    VALUES (${id}, ${name || null}, ${norm(email)}, ${image || null}, 'google', ${googleSub || null}, now())
    RETURNING id, name, email, image
  `;
  return rows[0];
}
