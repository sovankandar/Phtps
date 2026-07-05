import { HttpClientConfig, HttpResponse, HttpStreamResponse, Middleware, PhtpsPlugin, IHttpClient } from '../config/types';
import { InterceptorManager } from './InterceptorManager';
import { CacheManager } from './CacheManager';
import { TokenRotationManager } from './TokenRotationManager';
import type { QueueManager } from './QueueManager';
export declare class HttpClient implements IHttpClient {
    private config;
    interceptors: {
        request: InterceptorManager<HttpClientConfig>;
        response: InterceptorManager<HttpResponse | HttpStreamResponse>;
    };
    private middlewares;
    private isLocked;
    private installedPlugins;
    cacheManager?: CacheManager;
    queueManager?: QueueManager;
    private requestDeduper;
    tokenRotationManager: TokenRotationManager;
    private paginationManager;
    constructor(config?: HttpClientConfig);
    lock(): void;
    private ensureNotLocked;
    use(plugin: PhtpsPlugin | PhtpsPlugin[]): this;
    create(config?: Partial<HttpClientConfig>): HttpClient;
    setConfig(config: Partial<HttpClientConfig>): void;
    setGlobalHeader(key: string, value: string): void;
    removeGlobalHeader(key: string): void;
    clearCache(): void;
    destroy(): void;
    useMiddleware(middleware: Middleware): void;
    request<T = any>(config: HttpClientConfig): Promise<HttpResponse<T>>;
    stream<T = any>(url: string, config?: HttpClientConfig): Promise<HttpStreamResponse<T>>;
    private innerRequest;
    private executeWithQueue;
    private executeBase;
    get<T = any>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;
    post<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
    put<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
    patch<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
    delete<T = any>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;
}
//# sourceMappingURL=HttpClient.d.ts.map