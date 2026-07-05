import { MemoryCacheAdapter } from './adapters/MemoryCacheAdapter';
export class CacheManager {
    constructor(adapter) {
        this.adapter = adapter || new MemoryCacheAdapter();
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
//# sourceMappingURL=CacheManager.js.map