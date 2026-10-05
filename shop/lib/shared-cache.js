import { unstable_cache } from 'next/cache';

/**
 * A cache shared by every server instance (Vercel's data cache), not just the
 * one handling this request. Shipping quotes and product options change rarely,
 * and the supplier caps how often this app may call it, so each answer is
 * fetched once and reused by everyone for hours. Failures are never stored.
 *
 * Outside Next (plain node scripts) it falls back to calling straight through.
 */
export function shared(fn, name, revalidateSeconds) {
  let cached = null;
  return (...args) => {
    try {
      cached ??= unstable_cache(fn, [name], { revalidate: revalidateSeconds });
      return cached(...args);
    } catch {
      return fn(...args);
    }
  };
}
