export class TokenRotationManager {
    constructor() {
        this.isRefreshing = false;
        this.refreshSubscribers = [];
        this.defaultRefreshWindow = 60000; // 60 seconds
    }
    configure(config) {
        if (!config.tokenRotation || config.tokenRotation.enabled === false) {
            this.destroy();
            return;
        }
        this.config = config.tokenRotation;
        // Automatically boot the background timer if enabled
        if (this.config.autoRefreshBackground) {
            this.scheduleBackgroundRefresh();
        }
    }
    destroy() {
        this.clearBackgroundTimer();
        this.refreshSubscribers = [];
    }
    async interceptRequest(config) {
        const rotationConfig = config.tokenRotation || this.config;
        if (!rotationConfig || rotationConfig.enabled === false) {
            return config;
        }
        let token = rotationConfig.getToken ? await rotationConfig.getToken() : this.lastKnownToken;
        if (token) {
            this.lastKnownToken = token;
            const isExpired = await this.isTokenExpiring(token, rotationConfig);
            if (isExpired) {
                // Token is in the expiration window. Await a pre-emptive refresh.
                token = await this.triggerRefresh(rotationConfig);
            }
        }
        else if (this.isRefreshing) {
            // Missing token but a refresh is ongoing. Wait for it.
            token = await this.waitForRefresh();
        }
        if (token) {
            const headerName = rotationConfig.headerName || 'Authorization';
            const headerPrefix = rotationConfig.headerPrefix ?? 'Bearer ';
            const finalToken = `${headerPrefix}${token}`;
            const newHeaders = new Headers(config.headers);
            newHeaders.set(headerName, finalToken);
            return {
                ...config,
                headers: newHeaders
            };
        }
        return config;
    }
    async isTokenExpiring(token, config) {
        if (!config.getExpiration)
            return false;
        try {
            const expTimestamp = await config.getExpiration(token);
            if (!expTimestamp)
                return false;
            const refreshWindow = config.refreshWindow ?? this.defaultRefreshWindow;
            const timeToExpiry = expTimestamp - Date.now();
            return timeToExpiry <= refreshWindow;
        }
        catch (error) {
            console.warn('[Eping] Failed to evaluate token expiration. Treating as expired to force refresh.', error);
            return true; // Safe fallback: Force refresh
        }
    }
    getRefreshing() {
        return this.isRefreshing;
    }
    async triggerRefresh(config) {
        if (!this.isRefreshing) {
            this.isRefreshing = true;
            try {
                const newToken = await config.onRefresh();
                this.lastKnownToken = newToken;
                // Fulfill pending promises
                this.refreshSubscribers.forEach(sub => sub.resolve(newToken));
                this.refreshSubscribers = [];
                this.isRefreshing = false;
                // Reschedule background timer if necessary
                if (config.autoRefreshBackground) {
                    this.scheduleBackgroundRefresh();
                }
                return newToken;
            }
            catch (error) {
                this.isRefreshing = false;
                // Reject all pending requests
                this.refreshSubscribers.forEach(sub => sub.reject(error));
                this.refreshSubscribers = [];
                throw error;
            }
        }
        else {
            return this.waitForRefresh();
        }
    }
    waitForRefresh() {
        return new Promise((resolve, reject) => {
            this.refreshSubscribers.push({ resolve, reject });
        });
    }
    async scheduleBackgroundRefresh() {
        this.clearBackgroundTimer();
        if (!this.config)
            return;
        try {
            const token = this.config.getToken ? await this.config.getToken() : this.lastKnownToken;
            if (!token)
                return;
            if (!this.config.getExpiration) {
                console.warn('[Eping] autoRefreshBackground requires getExpiration to be defined.');
                return;
            }
            const expTimestamp = await this.config.getExpiration(token);
            if (!expTimestamp)
                return;
            const refreshWindow = this.config.refreshWindow ?? this.defaultRefreshWindow;
            let timeUntilRefresh = (expTimestamp - Date.now()) - refreshWindow;
            // Ensure we don't trigger negatively configured times (too late) or immediately flood
            timeUntilRefresh = Math.max(timeUntilRefresh, 0);
            this.backgroundTimerId = setTimeout(() => {
                if (this.config) {
                    this.triggerRefresh(this.config).catch(err => {
                        console.error('[Eping] Background token refresh failed', err);
                    });
                }
            }, timeUntilRefresh);
        }
        catch {
            // Ignore background scheduling failures
        }
    }
    clearBackgroundTimer() {
        if (this.backgroundTimerId) {
            clearTimeout(this.backgroundTimerId);
            this.backgroundTimerId = undefined;
        }
    }
}
//# sourceMappingURL=TokenRotationManager.js.map