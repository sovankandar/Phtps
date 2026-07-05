import { HttpClientConfig, TokenRotationConfig } from '../config/types';
export declare class TokenRotationManager {
    private isRefreshing;
    private refreshSubscribers;
    private backgroundTimerId?;
    private config?;
    private defaultRefreshWindow;
    private lastKnownToken?;
    constructor();
    configure(config: HttpClientConfig): void;
    destroy(): void;
    interceptRequest(config: HttpClientConfig): Promise<HttpClientConfig>;
    private isTokenExpiring;
    getRefreshing(): boolean;
    triggerRefresh(config: TokenRotationConfig): Promise<string>;
    private waitForRefresh;
    private scheduleBackgroundRefresh;
    private clearBackgroundTimer;
}
//# sourceMappingURL=TokenRotationManager.d.ts.map