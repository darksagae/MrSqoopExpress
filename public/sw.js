// Service worker for Mr Sqoop Express web push.
//
// Browsers that support Declarative Web Push (e.g. Safari) render the pushed
// notification from its JSON payload without running this code. This handler is
// the fallback for browsers that still require a `push` event listener
// (Chrome, Firefox, Edge). It reads the SAME payload shape the server sends.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { notification: { title: 'Mr Sqoop Express', body: event.data.text() } }
  }

  const n = payload.notification ?? payload
  const title = n.title ?? 'Mr Sqoop Express'
  const url = n.navigate ?? n.data?.url ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: n.body,
      icon: n.icon ?? '/logo.png',
      badge: n.badge ?? '/logo.png',
      tag: n.tag,
      data: { ...(n.data ?? {}), url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
