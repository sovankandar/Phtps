import { CacheManager } from '../core/CacheManager';
import { MemoryCacheAdapter } from '../core/adapters/MemoryCacheAdapter';
/**
 * Extends the Phtps client with full Caching capabilities for GET requests.
 * By stripping this from the core, Phtps runs leaner for architectures that don't cache locally.
 */
export const CachePlugin = (options) => {
    return {
        name: 'cache',
        install: (client) => {
            client.cacheManager = new CacheManager(options?.adapter || new MemoryCacheAdapter());
        }
    };
};
//# sourceMappingURL=CachePlugin.js.map