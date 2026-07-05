import { CacheAdapter } from '../config/types';
export declare class CacheManager {
    private adapter;
    constructor(adapter?: CacheAdapter);
    setAdapter(adapter: CacheAdapter): void;
    set(key: string, data: any, ttl: number): Promise<void>;
    get(key: string): Promise<any | null>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=CacheManager.d.ts.map