import { neon } from '@neondatabase/serverless';

/**
 * Neon Postgres client.
 *
 * Initialised lazily: neon() throws when DATABASE_URL is unset, and Next.js
 * evaluates module top-level code at build time, so eager construction would
 * break `next build` on any environment without the var.
 */
let _sql = null;

export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}
