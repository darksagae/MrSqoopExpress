import { getPushPublicKey, savePushSubscription } from './ordersApi'

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: string }

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

/**
 * Requests notification permission, subscribes this device to push, and links
 * the subscription to the given order on the server. Safe to call repeatedly —
 * re-subscribing simply refreshes the stored subscription.
 */
export async function enableOrderNotifications(orderId: string): Promise<PushEnableResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'This browser does not support notifications.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notifications were not allowed.' }
  }

  let publicKey: string
  try {
    publicKey = await getPushPublicKey()
  } catch {
    return { ok: false, reason: 'Notifications are not available right now.' }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }))

    await savePushSubscription(orderId, subscription.toJSON())
    return { ok: true }
  } catch (error) {
    console.error('Failed to enable notifications', error)
    return { ok: false, reason: 'Could not enable notifications. Try again.' }
  }
}
