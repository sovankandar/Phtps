import { PhtpsPlugin, CacheAdapter } from '../config/types';
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
export declare const CachePlugin: (options?: CachePluginOptions) => PhtpsPlugin;
//# sourceMappingURL=CachePlugin.d.ts.map