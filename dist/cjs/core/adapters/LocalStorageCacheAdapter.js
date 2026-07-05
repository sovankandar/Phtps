"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageCacheAdapter = void 0;
class LocalStorageCacheAdapter {
    constructor(prefix = 'phtps_cache_') {
        this.prefix = prefix;
    }
    async get(key) {
        if (typeof window === 'undefined')
            return null;
        const item = window.localStorage.getItem(this.prefix + key);
        if (!item)
            return null;
        try {
            const entry = JSON.parse(item);
            if (Date.now() > entry.expiry) {
                window.localStorage.removeItem(this.prefix + key);
                return null;
            }
            return entry.data;
        }
        catch {
            return null;
        }
    }
    async set(key, data, ttl) {
        if (typeof window === 'undefined')
            return;
        try {
            const expiry = Date.now() + ttl;
            const entry = { data, expiry };
            window.localStorage.setItem(this.prefix + key, JSON.stringify(entry));
        }
        catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.warn(`[Phtps] LocalStorage quota exceeded. Clearing cache for prefix: ${this.prefix}`);
                await this.clear();
                try {
                    const expiry = Date.now() + ttl;
                    const entry = { data, expiry };
                    window.localStorage.setItem(this.prefix + key, JSON.stringify(entry));
                }
                catch (retryError) {
                    console.error('[Phtps] Failed to store data even after clearing cache.', retryError);
                }
            }
        }
    }
    async delete(key) {
        if (typeof window === 'undefined')
            return;
        window.localStorage.removeItem(this.prefix + key);
    }
    async clear() {
        if (typeof window === 'undefined')
            return;
        const keysToRemove = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => window.localStorage.removeItem(key));
    }
}
exports.LocalStorageCacheAdapter = LocalStorageCacheAdapter;
//# sourceMappingURL=LocalStorageCacheAdapter.js.map