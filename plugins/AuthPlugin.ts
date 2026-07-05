import { PhtpsPlugin, HttpResponse, HttpStreamResponse } from '../config/types';

export const AuthPlugin = (): PhtpsPlugin => {
  return {
    name: 'auth',
    install: (client) => {
      const tokenRotationManager = client.tokenRotationManager;
      if (!tokenRotationManager) return;

      // 1. Response Interceptor for Reactive (401) Refresh
      client.interceptors.response.use(
        (response: HttpResponse | HttpStreamResponse) => response,
        async (error: any) => {
          const config = error.config;
          if (error.response?.status === 401 && config?.onTokenRefresh && !config._isRetry) {
            
            try {
              // Delegate to TokenRotationManager to ensure single refresh flight
              const newToken = await tokenRotationManager.triggerRefresh({
                onRefresh: config.onTokenRefresh,
                enabled: true,
                ...(config.tokenRotation || {})
              });

              const mergedHeaders = new Headers((config.headers as HeadersInit) || {});
              if (newToken) {
                const currentAuth = mergedHeaders.get('Authorization');
                if (newToken.includes(' ')) {
                  mergedHeaders.set('Authorization', newToken);
                } else if (currentAuth && currentAuth.toLowerCase().startsWith('bearer ')) {
                  mergedHeaders.set('Authorization', `Bearer ${newToken}`);
                } else {
                  mergedHeaders.set('Authorization', `Bearer ${newToken}`);
                }
              }

              const retryConfig = { ...config, headers: mergedHeaders, _isRetry: true };
              return client.request(retryConfig);
            } catch (refreshError) {
              if (config.onRefreshFailure) {
                try {
                  await config.onRefreshFailure(refreshError);
                } catch (callbackErr) {
                  console.error('Error in onRefreshFailure callback:', callbackErr);
                }
              }
              return Promise.reject(refreshError);
            }
          }
          return Promise.reject(error);
        }
      );
    }
  };
};
