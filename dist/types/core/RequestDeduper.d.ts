import { HttpResponse, HttpStreamResponse } from '../config/types';
export declare class RequestDeduper {
    private pendingRequests;
    getOrExecute<T>(key: string, execute: () => Promise<HttpResponse<T> | HttpStreamResponse<T>>): Promise<HttpResponse<T> | HttpStreamResponse<T>>;
}
//# sourceMappingURL=RequestDeduper.d.ts.map