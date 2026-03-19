export class TTLCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();

  set(key: string, value: T, ttlMs: number = 300000) { // Default 5 minutes
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear() {
    this.cache.clear();
  }
}

// TTL cache for schema and structural metadata lookups
export const schemaCache = new TTLCache<any[]>();
