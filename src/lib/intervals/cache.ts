// Short-lived server memory for Intervals.icu reads: identical requests within the TTL share one call
// (also while it is still in flight), so going back and forth between pages doesn't queue new downloads.

const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    // Never keep a failure.
    store.delete(key);
    throw e;
  });
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Forget every entry whose key starts with `prefix` (after a write to Intervals.icu). */
export function invalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
