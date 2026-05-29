// Tiny in-memory cache with a TTL.

interface Entry<V> {
  value: V;
  expires: number;
}

export interface TtlValueCache<V> {
  get(): Promise<V>;
  invalidate(): void;
}

export function ttlValueCache<V>(ttlMs: number, load: () => Promise<V>): TtlValueCache<V> {
  let entry: Entry<V> | null = null;
  return {
    async get() {
      const now = Date.now();
      if (entry && entry.expires > now) return entry.value;
      const value = await load();
      entry = { value, expires: now + ttlMs };
      return value;
    },
    invalidate() {
      entry = null;
    },
  };
}
