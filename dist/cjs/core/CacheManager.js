"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const MemoryCacheAdapter_1 = require("./adapters/MemoryCacheAdapter");
class CacheManager {
    constructor(adapter) {
        this.adapter = adapter || new MemoryCacheAdapter_1.MemoryCacheAdapter();
    }
    setAdapter(adapter) {
        this.adapter = adapter;
    }
    async set(key, data, ttl) {
        await this.adapter.set(key, data, ttl);
    }
    async get(key) {
        return await this.adapter.get(key);
    }
    async delete(key) {
        await this.adapter.delete(key);
    }
    async clear() {
        await this.adapter.clear();
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=CacheManager.js.map