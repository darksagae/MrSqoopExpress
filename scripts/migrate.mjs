import { neon } from '@neondatabase/serverless'

const demoHistory = [
  { stageIndex: 0, timestamp: '2026-05-28T06:12:00.000Z' },
  { stageIndex: 1, timestamp: '2026-05-29T11:40:00.000Z' },
  { stageIndex: 2, timestamp: '2026-06-01T08:05:00.000Z' },
  { stageIndex: 3, timestamp: '2026-06-03T17:22:00.000Z' },
  { stageIndex: 4, timestamp: '2026-06-05T03:15:00.000Z' },
  { stageIndex: 5, timestamp: '2026-06-12T07:30:00.000Z' },
  { stageIndex: 6, timestamp: '2026-06-14T13:45:00.000Z' },
  { stageIndex: 7, timestamp: '2026-06-15T06:00:00.000Z' },
  { stageIndex: 8, timestamp: '2026-06-15T11:20:00.000Z' },
]

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const sql = neon(databaseUrl)

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tracking_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      website_shipped_from TEXT NOT NULL,
      billing_ugx INTEGER NOT NULL,
      current_stage_index INTEGER NOT NULL DEFAULT 0,
      status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      expected_delivery TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_orders_tracking_id_lower ON orders (LOWER(tracking_id))`
  await sql`CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (phone)`

  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_order ON push_subscriptions (order_id)`

  await sql`
    INSERT INTO orders (
      tracking_id,
      customer_name,
      phone,
      website_shipped_from,
      billing_ugx,
      current_stage_index,
      status_history,
      expected_delivery,
      created_at
    )
    VALUES (
      'CRR0215AA1',
      'Sarah Nakato',
      '0756132911',
      'Amazon',
      285000,
      8,
      ${JSON.stringify(demoHistory)}::jsonb,
      '2026-06-16T08:00:00.000Z',
      '2026-05-28T06:12:00.000Z'
    )
    ON CONFLICT (tracking_id) DO NOTHING
  `

  console.log('Database migrated successfully.')
}

migrate().catch((error) => {
  console.error(error)
  process.exit(1)
})
