import { CacheAdapter } from '../../config/types';

interface CacheEntry {
  data: any;
  expiry: number;
}

export class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, CacheEntry>();

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(key: string, data: any, ttl: number): Promise<void> {
    const expiry = Date.now() + ttl;
    this.cache.set(key, { data, expiry });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
