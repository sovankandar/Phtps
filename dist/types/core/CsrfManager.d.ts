import { HttpClientConfig } from '../config/types';
export declare class CsrfManager {
    private static defaultMethods;
    private static defaultCookieName;
    private static defaultHeaderName;
    static attach(config: HttpClientConfig): Promise<HttpClientConfig>;
    private static resolveToken;
    private static getCookie;
    private static isSameOrigin;
}
//# sourceMappingURL=CsrfManager.d.ts.map