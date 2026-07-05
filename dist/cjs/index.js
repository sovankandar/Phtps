"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Phtps = exports.createHttpClient = void 0;
const HttpClient_1 = require("./core/HttpClient");
/**
 * Creates a new HttpClient instance.
 * Recommended for SSR and multi-tenant applications to avoid state bleeding.
 */
const createHttpClient = (config) => {
    return new HttpClient_1.HttpClient(config);
};
exports.createHttpClient = createHttpClient;
/**
 * Default singleton instance for quick use in browser-based applications.
 * WARNING: Avoid using this singleton in SSR or multi-tenant environments as global state (like headers) may bleed between requests.
 */
exports.Phtps = (0, exports.createHttpClient)();
exports.Phtps.lock();
exports.default = exports.Phtps;
__exportStar(require("./config/types"), exports);
__exportStar(require("./core/HttpClient"), exports);
__exportStar(require("./core/InterceptorManager"), exports);
__exportStar(require("./core/CacheManager"), exports);
__exportStar(require("./core/QueueManager"), exports);
__exportStar(require("./core/adapters/MemoryCacheAdapter"), exports);
__exportStar(require("./core/adapters/LocalStorageCacheAdapter"), exports);
__exportStar(require("./env"), exports);
__exportStar(require("./plugins"), exports);
//# sourceMappingURL=index.js.map