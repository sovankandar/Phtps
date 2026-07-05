import { CacheAdapter } from '../config/types';
import { MemoryCacheAdapter } from './adapters/MemoryCacheAdapter';

export class CacheManager {
  private adapter: CacheAdapter;

  constructor(adapter?: CacheAdapter) {
    this.adapter = adapter || new MemoryCacheAdapter();
  }

  setAdapter(adapter: CacheAdapter): void {
    this.adapter = adapter;
  }

  async set(key: string, data: any, ttl: number): Promise<void> {
    await this.adapter.set(key, data, ttl);
  }

  async get(key: string): Promise<any | null> {
    return await this.adapter.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.adapter.delete(key);
  }

  async clear(): Promise<void> {
    await this.adapter.clear();
  }
}
