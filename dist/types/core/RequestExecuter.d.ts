import { HttpClientConfig, HttpResponse, HttpStreamResponse } from '../config/types';
export declare class RequestExecutor {
    static execute<T>(config: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>>;
    private static parseResponse;
    private static readWithProgress;
    private static executeWithXHR;
}
//# sourceMappingURL=RequestExecuter.d.ts.map