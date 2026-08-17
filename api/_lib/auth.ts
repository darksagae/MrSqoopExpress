import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSql } from './db.js'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

let authTablesReady: Promise<void> | null = null

async function ensureAuthTables() {
  if (!authTablesReady) {
    const sql = getSql()
    authTablesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS admin_credentials (
          id INTEGER PRIMARY KEY DEFAULT 1,
          username TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT admin_credentials_single_row CHECK (id = 1)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS admin_reset_tokens (
          token TEXT PRIMARY KEY,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
    })()
  }
  await authTablesReady
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET is not configured')
  }
  return secret
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false

  const hashBuf = Buffer.from(hash, 'hex')
  const candidateBuf = scryptSync(password, salt, 64)
  if (hashBuf.length !== candidateBuf.length) return false

  return timingSafeEqual(Uint8Array.from(hashBuf), Uint8Array.from(candidateBuf))
}

function getEnvCredentials() {
  return {
    username: process.env.ADMIN_USERNAME ?? 'developer',
    password: process.env.ADMIN_PASSWORD ?? 'developer',
  }
}

async function getStoredCredentials() {
  await ensureAuthTables()
  const sql = getSql()
  const rows = (await sql`
    SELECT username, password_hash FROM admin_credentials WHERE id = 1 LIMIT 1
  `) as { username: string; password_hash: string }[]

  return rows[0] ?? null
}

export async function getAdminUsername() {
  const stored = await getStoredCredentials()
  return stored?.username ?? getEnvCredentials().username
}

export async function verifyAdminPassword(username: string, password: string) {
  const stored = await getStoredCredentials()

  if (stored) {
    return username === stored.username && verifyPassword(password, stored.password_hash)
  }

  const envCredentials = getEnvCredentials()
  return username === envCredentials.username && password === envCredentials.password
}

export async function setAdminCredentials(username: string, password: string) {
  await ensureAuthTables()
  const sql = getSql()
  const passwordHash = hashPassword(password)

  await sql`
    INSERT INTO admin_credentials (id, username, password_hash, updated_at)
    VALUES (1, ${username}, ${passwordHash}, NOW())
    ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
  `
}

export function createAdminToken(username: string) {
  const issuedAt = Date.now().toString()
  const payload = `${username}:${issuedAt}`
  const signature = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

export async function verifyAdminToken(token: string | undefined | null) {
  if (!token) return false

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [username, issuedAt, signature] = decoded.split(':')
    if (!username || !issuedAt || !signature) return false

    const payload = `${username}:${issuedAt}`
    const expected = createHmac('sha256', getSessionSecret()).update(payload).digest('hex')
    const signatureBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expected)
    if (signatureBuf.length !== expectedBuf.length) return false
    const validSignature = timingSafeEqual(
      Uint8Array.from(signatureBuf),
      Uint8Array.from(expectedBuf),
    )
    if (!validSignature) return false

    const age = Date.now() - Number(issuedAt)
    if (Number.isNaN(age) || age > TOKEN_TTL_MS) return false

    const adminUsername = await getAdminUsername()
    return username === adminUsername
  } catch {
    return false
  }
}

export function getBearerToken(req: VercelRequest) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7).trim()
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const token = getBearerToken(req)
  if (!(await verifyAdminToken(token))) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

export async function createPasswordResetToken() {
  await ensureAuthTables()
  const sql = getSql()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString()

  await sql`
    INSERT INTO admin_reset_tokens (token, expires_at)
    VALUES (${token}, ${expiresAt})
  `

  return token
}

export async function consumePasswordResetToken(token: string) {
  await ensureAuthTables()
  const sql = getSql()

  const rows = (await sql`
    UPDATE admin_reset_tokens
    SET used = TRUE
    WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
    RETURNING token
  `) as { token: string }[]

  return rows.length > 0
}
