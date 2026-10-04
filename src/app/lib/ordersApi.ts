import type { Order, ReviewAction } from '../types/order'

const AUTH_KEY = 'mrsqoop_admin_token'

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new ApiError(data.error ?? 'Request failed.', response.status)
  }
  return data
}

function authHeaders(includeJson = true) {
  const headers: Record<string, string> = {}
  if (includeJson) headers['Content-Type'] = 'application/json'

  const token = sessionStorage.getItem(AUTH_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  return headers
}

export function getAuthToken() {
  return sessionStorage.getItem(AUTH_KEY)
}

export function setAuthToken(token: string) {
  sessionStorage.setItem(AUTH_KEY, token)
}

export function clearAuthToken() {
  sessionStorage.removeItem(AUTH_KEY)
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username, password }),
  })

  const data = await parseJson<{ token: string }>(response)
  setAuthToken(data.token)
}

export async function requestPasswordReset() {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: authHeaders(),
  })
  await parseJson<{ ok: boolean }>(response)
}

export async function resetPassword(token: string, username: string, password: string) {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ token, username, password }),
  })
  await parseJson<{ ok: boolean }>(response)
}

export async function checkAdminSession() {
  const token = getAuthToken()
  if (!token) return false

  try {
    const response = await fetch('/api/auth/session', {
      headers: authHeaders(false),
    })
    const data = await parseJson<{ authenticated: boolean }>(response)
    if (!data.authenticated) clearAuthToken()
    return data.authenticated
  } catch {
    clearAuthToken()
    return false
  }
}

export async function fetchAllOrders(): Promise<Order[]> {
  const response = await fetch('/api/orders', {
    headers: authHeaders(false),
  })
  const data = await parseJson<{ orders: Order[] }>(response)
  return data.orders
}

export async function trackOrder(query: string): Promise<Order | null> {
  const response = await fetch(`/api/orders/track?q=${encodeURIComponent(query)}`)

  if (response.status === 404) return null

  const data = await parseJson<{ order: Order }>(response)
  return data.order
}

export async function createOrder(input: {
  customerName: string
  trackingId: string
  phone: string
  websiteShippedFrom: string
  billingUgx: number
}): Promise<{ order: Order } | { error: string }> {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    })
    const data = await parseJson<{ order: Order }>(response)
    return { order: data.order }
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message }
    }
    return { error: 'Could not create order.' }
  }
}

export async function advanceOrder(id: string): Promise<Order | null> {
  const response = await fetch(`/api/orders/item?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({}),
  })
  const data = await parseJson<{ order: Order }>(response)
  return data.order
}

export async function updateOrderBilling(id: string, billingUgx: number): Promise<Order> {
  const response = await fetch(`/api/orders/item?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ billingUgx }),
  })
  const data = await parseJson<{ order: Order }>(response)
  return data.order
}

/** Confirm, hold or cancel a paid order. Throws with the server's message on a conflict. */
export async function reviewOrder(id: string, review: ReviewAction, note?: string): Promise<Order> {
  const response = await fetch(`/api/orders/item?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ review, note }),
  })
  const data = await parseJson<{ order: Order }>(response)
  return data.order
}

export async function deleteOrder(id: string) {
  const response = await fetch(`/api/orders/item?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(false),
  })
  await parseJson<{ ok: boolean }>(response)
}

export async function getPushPublicKey(): Promise<string> {
  const response = await fetch('/api/push/subscribe')
  const data = await parseJson<{ publicKey: string }>(response)
  return data.publicKey
}

export async function savePushSubscription(
  orderId: string,
  subscription: PushSubscriptionJSON,
): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, subscription }),
  })
  await parseJson<{ ok: boolean }>(response)
}

export async function migrateDatabase() {
  const response = await fetch('/api/db/migrate', {
    method: 'POST',
    headers: authHeaders(false),
  })
  await parseJson<{ ok: boolean }>(response)
}

export { ApiError }

export interface ShopSettings {
  rate: number
  handlingPercent: number
  promo: { enabled: boolean; code: string; text: string }
}

export async function fetchShopSettings(): Promise<ShopSettings> {
  const response = await fetch('/api/settings', { headers: authHeaders(false) })
  return (await parseJson<{ settings: ShopSettings }>(response)).settings
}

export async function saveShopSettings(settings: ShopSettings): Promise<ShopSettings> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  })
  return (await parseJson<{ settings: ShopSettings }>(response)).settings
}
