import webpush from 'web-push'
import { getSql } from './db.js'
import type { Order } from './orders.js'

// Kept in sync with src/app/types/order.ts (TRACKING_STAGES).
const TRACKING_STAGES = [
  'Order Confirmed',
  'Order Processing',
  'Package Shipped to International Address',
  'Package Received at International Address',
  'Package in Transit to Uganda',
  'Customs Clearance Started',
  'Customs Clearance Complete',
  'Package Arrived at Kampala Office',
  'Package Ready for Pick Up',
  'Order Delivered',
] as const

export interface PushSubscriptionInput {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

let vapidConfigured = false

function configureVapid(): boolean {
  if (vapidConfigured) return true

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@mrsqoopexpress.com'

  if (!publicKey || !privateKey) return false

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

export async function saveSubscription(orderId: string, sub: PushSubscriptionInput) {
  const sql = getSql()
  await sql`
    INSERT INTO push_subscriptions (order_id, endpoint, p256dh, auth)
    VALUES (${orderId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE
      SET order_id = EXCLUDED.order_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth
  `
}

function buildDeclarativePayload(order: Order) {
  const stageIndex = order.currentStageIndex
  const stageLabel = TRACKING_STAGES[stageIndex] ?? 'Status updated'
  const siteUrl = process.env.VITE_PUBLIC_SITE_URL ?? 'https://mrsqoopexpress.com'

  // Declarative Web Push (RFC 8030 / WHATWG declarative push) payload.
  // Supporting browsers (Safari) render this with no service-worker code.
  // Our service worker uses the same shape as a fallback for Chrome/Firefox.
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title: 'Mr Sqoop Express',
      lang: 'en',
      dir: 'auto',
      body: `Order #${order.trackingId}: ${stageLabel}`,
      navigate: `${siteUrl}/?track=${encodeURIComponent(order.trackingId)}`,
      icon: `${siteUrl}/logo.png`,
      badge: `${siteUrl}/logo.png`,
      tag: `order-${order.id}`,
      // Custom data the service worker fallback can read.
      data: {
        trackingId: order.trackingId,
        stageIndex,
        url: `${siteUrl}/?track=${encodeURIComponent(order.trackingId)}`,
      },
    },
  })
}

/**
 * Sends a status-update push to every device subscribed to this order.
 * Best-effort: failures are logged and expired subscriptions are pruned.
 */
export async function sendOrderStatusPush(order: Order): Promise<void> {
  if (!configureVapid()) {
    console.warn('Web Push skipped: VAPID keys are not configured.')
    return
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE order_id = ${order.id}
  `) as { endpoint: string; p256dh: string; auth: string }[]

  if (rows.length === 0) return

  const payload = buildDeclarativePayload(order)
  const staleEndpoints: string[] = []

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          payload,
          { urgency: 'high' },
        )
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(row.endpoint)
        } else {
          console.error('Push send failed', row.endpoint, statusCode ?? error)
        }
      }
    }),
  )

  if (staleEndpoints.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ANY(${staleEndpoints})`
  }
}
