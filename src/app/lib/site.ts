export const PUBLIC_SITE_URL =
  import.meta.env.VITE_PUBLIC_SITE_URL ?? 'https://mrsqoopexpress.com'

export const ADMIN_SITE_URL =
  import.meta.env.VITE_ADMIN_SITE_URL ?? 'https://control.mrsqoopexpress.com'

export function isAdminHost() {
  if (typeof window === 'undefined') return false

  const host = window.location.hostname.toLowerCase()

  if (host === 'control.mrsqoopexpress.com' || host.startsWith('control.')) {
    return true
  }

  if (import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1')) {
    return (
      window.location.hash === '#admin' ||
      new URLSearchParams(window.location.search).has('reset_token')
    )
  }

  return false
}

export function publicSiteHref(path = '/') {
  if (import.meta.env.DEV) {
    return path === '/' ? '/' : path
  }
  return `${PUBLIC_SITE_URL}${path}`
}

export function adminSiteHref(path = '/') {
  if (import.meta.env.DEV) {
    return path === '/' ? '/#admin' : `/#admin${path}`
  }
  return `${ADMIN_SITE_URL}${path}`
}
