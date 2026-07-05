import { HttpClient } from './core/HttpClient';
import { HttpClientConfig } from './config/types';

/**
 * Creates a new HttpClient instance.
 * Recommended for SSR and multi-tenant applications to avoid state bleeding.
 */
export const createHttpClient = (config?: HttpClientConfig) => {
  return new HttpClient(config);
};

/**
 * Default singleton instance for quick use in browser-based applications.
 * WARNING: Avoid using this singleton in SSR or multi-tenant environments as global state (like headers) may bleed between requests.
 */
export const Phtps = createHttpClient();
Phtps.lock();
export default Phtps;

export * from './config/types';
export * from './core/HttpClient';
export * from './core/InterceptorManager';
export * from './core/CacheManager';
export * from './core/QueueManager';
export * from './core/adapters/MemoryCacheAdapter';
export * from './core/adapters/LocalStorageCacheAdapter';
export * from './env';
export * from './plugins';
