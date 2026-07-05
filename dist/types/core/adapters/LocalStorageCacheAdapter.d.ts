import { CacheAdapter } from '../../config/types';
export declare class LocalStorageCacheAdapter implements CacheAdapter {
    private prefix;
    constructor(prefix?: string);
    get(key: string): Promise<any | null>;
    set(key: string, data: any, ttl: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=LocalStorageCacheAdapter.d.ts.map