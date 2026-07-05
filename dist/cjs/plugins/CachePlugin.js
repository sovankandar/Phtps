"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachePlugin = void 0;
const CacheManager_1 = require("../core/CacheManager");
const MemoryCacheAdapter_1 = require("../core/adapters/MemoryCacheAdapter");
/**
 * Extends the Phtps client with full Caching capabilities for GET requests.
 * By stripping this from the core, Phtps runs leaner for architectures that don't cache locally.
 */
const CachePlugin = (options) => {
    return {
        name: 'cache',
        install: (client) => {
            client.cacheManager = new CacheManager_1.CacheManager(options?.adapter || new MemoryCacheAdapter_1.MemoryCacheAdapter());
        }
    };
};
exports.CachePlugin = CachePlugin;
//# sourceMappingURL=CachePlugin.js.map