import { IHttpClient, PhtpsPlugin, CacheAdapter } from '../config/types';
import { CacheManager } from '../core/CacheManager';
import { MemoryCacheAdapter } from '../core/adapters/MemoryCacheAdapter';

export interface CachePluginOptions {
  /**
   * Replace the underlying cache storage. 
   * Defaults to an in-memory storage adapter.
   */
  adapter?: CacheAdapter;
}

/**
 * Extends the Phtps client with full Caching capabilities for GET requests.
 * By stripping this from the core, Phtps runs leaner for architectures that don't cache locally.
 */
export const CachePlugin = (options?: CachePluginOptions): PhtpsPlugin => {
  return {
    name: 'cache',
    install: (client: IHttpClient) => {
      client.cacheManager = new CacheManager(options?.adapter || new MemoryCacheAdapter());
    }
  };
};
