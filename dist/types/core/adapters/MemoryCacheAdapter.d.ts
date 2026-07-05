import { CacheAdapter } from '../../config/types';
export declare class MemoryCacheAdapter implements CacheAdapter {
    private cache;
    get(key: string): Promise<any | null>;
    set(key: string, data: any, ttl: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=MemoryCacheAdapter.d.ts.map