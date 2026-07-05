export class MemoryCacheAdapter {
    constructor() {
        this.cache = new Map();
    }
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
    async set(key, data, ttl) {
        const expiry = Date.now() + ttl;
        this.cache.set(key, { data, expiry });
    }
    async delete(key) {
        this.cache.delete(key);
    }
    async clear() {
        this.cache.clear();
    }
}
//# sourceMappingURL=MemoryCacheAdapter.js.map