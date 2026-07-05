import { HttpClientConfig } from '../config/types';
export declare class StreamReader {
    static transform<T = any>(response: Response, config: HttpClientConfig): ReadableStream<T>;
    private static asTextStream;
    private static asJsonStream;
    private static asSseStream;
}
//# sourceMappingURL=StreamReader.d.ts.map