const store = new Map<string, { data: unknown; expiresAt: number }>();

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.data as T;
}

export function setCache(key: string, data: unknown, ttlSeconds = 300): void {
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function clearCache(key?: string): void {
  if (key) {
    store.delete(key);
    return;
  }
  store.clear();
}
