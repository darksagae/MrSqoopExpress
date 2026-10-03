/**
 * Run fn over items with at most `limit` in flight, keeping that many busy until
 * the list is done. Unlike fixed batches, one slow call never makes the rest wait
 * for its whole batch to finish. Results keep the input order.
 */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Remember successful async results for ttlMs and share one in-flight call
 * between concurrent askers. Failures are not remembered, so a throttled or
 * timed-out lookup is simply tried again next time.
 */
export function memoAsync(fn, { ttlMs, max = 2000 }) {
  const done = new Map(); // key -> { at, value }
  const inflight = new Map();

  return (key, ...args) => {
    const hit = done.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);

    const p = fn(key, ...args)
      .then((value) => {
        if (done.size >= max) done.delete(done.keys().next().value);
        done.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
