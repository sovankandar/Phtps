import { HttpClientConfig, HttpResponse, HttpStreamResponse, Middleware } from '../config/types';
export declare class MiddlewarePipeline {
    private middlewares;
    private finalHandler;
    constructor(middlewares: Middleware[], finalHandler: (config: HttpClientConfig) => Promise<HttpResponse<any> | HttpStreamResponse<any>>);
    execute<T>(config: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>>;
}
//# sourceMappingURL=MiddlewarePipeline.d.ts.map