import { HttpClientConfig, HttpResponse, PaginateConfig, IHttpClient } from '../config/types';
export interface PaginationStrategy {
    computeNextParams(config: HttpClientConfig, response: HttpResponse, items: any[], currentPageIndex: number, currentOffset: number): Record<string, any> | null;
    extractNextCursor?(config: PaginateConfig, response: HttpResponse): string | number | null;
}
export declare class PaginationManager {
    private client;
    private strategies;
    private onResponseHooks;
    constructor(client: IHttpClient);
    private registerDefaultStrategies;
    registerStrategy(name: string, strategy: PaginationStrategy): void;
    addOnResponseHook(hook: (response: HttpResponse) => void): void;
    aggregate<T>(config: HttpClientConfig, next: (cfg: HttpClientConfig) => Promise<HttpResponse<T>>): Promise<HttpResponse<T[]>>;
    handleResponse(response: HttpResponse): void;
    extractItems(config: PaginateConfig, res: HttpResponse): any[];
    hasNextPage(config: PaginateConfig, res: HttpResponse, allItems: any[]): boolean;
}
//# sourceMappingURL=PaginationManager.d.ts.map