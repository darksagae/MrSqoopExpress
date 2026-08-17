#!/usr/bin/env node
// Creates the orders table. Safe to re-run — everything is IF NOT EXISTS.
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { initSchema } = await import('../lib/orders.js');
await initSchema();
console.log('orders table ready');

const { initUserSchema } = await import('../lib/users.js');
await initUserSchema();
console.log('users table ready');
