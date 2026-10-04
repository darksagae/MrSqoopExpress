/**
 * Where to go after logging in. Only same-site paths are honoured, so a crafted
 * ?next=https://evil.example link can't bounce someone off-site after login.
 */
export function safeNext(value, fallback = '/') {
  const v = String(value || '');
  return v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : fallback;
}

export function nextFromUrl(fallback = '/') {
  if (typeof window === 'undefined') return fallback;
  return safeNext(new URLSearchParams(window.location.search).get('next'), fallback);
}
