"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthPlugin = void 0;
const AuthPlugin = () => {
    return {
        name: 'auth',
        install: (client) => {
            const tokenRotationManager = client.tokenRotationManager;
            if (!tokenRotationManager)
                return;
            // 1. Response Interceptor for Reactive (401) Refresh
            client.interceptors.response.use((response) => response, async (error) => {
                const config = error.config;
                if (error.response?.status === 401 && config?.onTokenRefresh && !config._isRetry) {
                    try {
                        // Delegate to TokenRotationManager to ensure single refresh flight
                        const newToken = await tokenRotationManager.triggerRefresh({
                            onRefresh: config.onTokenRefresh,
                            enabled: true,
                            ...(config.tokenRotation || {})
                        });
                        const mergedHeaders = new Headers(config.headers || {});
                        if (newToken) {
                            const currentAuth = mergedHeaders.get('Authorization');
                            if (newToken.includes(' ')) {
                                mergedHeaders.set('Authorization', newToken);
                            }
                            else if (currentAuth && currentAuth.toLowerCase().startsWith('bearer ')) {
                                mergedHeaders.set('Authorization', `Bearer ${newToken}`);
                            }
                            else {
                                mergedHeaders.set('Authorization', `Bearer ${newToken}`);
                            }
                        }
                        const retryConfig = { ...config, headers: mergedHeaders, _isRetry: true };
                        return client.request(retryConfig);
                    }
                    catch (refreshError) {
                        if (config.onRefreshFailure) {
                            try {
                                await config.onRefreshFailure(refreshError);
                            }
                            catch (callbackErr) {
                                console.error('Error in onRefreshFailure callback:', callbackErr);
                            }
                        }
                        return Promise.reject(refreshError);
                    }
                }
                return Promise.reject(error);
            });
        }
    };
};
exports.AuthPlugin = AuthPlugin;
//# sourceMappingURL=AuthPlugin.js.map