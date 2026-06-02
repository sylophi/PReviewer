// Tiny in-memory cache with a TTL.

interface Entry<V> {
  // The in-flight or settled load. Holding the promise (not the resolved
  // value) means concurrent callers during a cache miss share one load
  // instead of each firing their own — which is the whole point of the
  // ttl for things like the gh-readiness probe.
  promise: Promise<V>;
  expires: number;
}

export interface TtlValueCache<V> {
  get(): Promise<V>;
  invalidate(): void;
}

export function ttlValueCache<V>(ttlMs: number, load: () => Promise<V>): TtlValueCache<V> {
  let entry: Entry<V> | null = null;
  return {
    get() {
      const now = Date.now();
      if (entry && entry.expires > now) return entry.promise;
      const promise = load();
      entry = { promise, expires: now + ttlMs };
      // A rejected load shouldn't poison the cache for the full ttl;
      // clear the slot so the next caller retries.
      promise.catch(() => {
        if (entry?.promise === promise) entry = null;
      });
      return promise;
    },
    invalidate() {
      entry = null;
    },
  };
}
