import { PhtpsPlugin, HttpClientConfig, MiddlewareNext } from '../config/types';

export const RetryPlugin = (): PhtpsPlugin => {
  return {
    name: 'retry',
    install: (client) => {
      client.useMiddleware(async (config: HttpClientConfig, next: MiddlewareNext) => {
        // Skip retry logic if this is a retry attempt from AuthPlugin or other sources
        if (config._isRetry) return next(config);

        const execute = async (attempt: number): Promise<any> => {
          try {
            return await next({
              ...config,
              _isEncrypted: undefined,
              _isDecrypted: undefined,
            });
          } catch (error: any) {
            const maxRetries = config.retries ?? 0;
            // Never retry cancellation or 401s (which are handled by AuthPlugin)
            if (!error.isCancel && attempt < maxRetries && error.response?.status !== 401) {
              const shouldRetry = config.retryCondition 
                ? await config.retryCondition(error)
                : (!error.response || error.response.status >= 500); // Default retry condition

              if (shouldRetry) {
                const retryDelay = config.retryDelay ?? 1000;
                let delay = 0;
                const attemptNumber = attempt + 1;
                
                if (typeof retryDelay === 'function') {
                  delay = retryDelay(attemptNumber, error);
                } else {
                  // Exponential backoff + jitter
                  const exponentialDelay = retryDelay * Math.pow(2, attemptNumber - 1);
                  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
                  delay = Math.max(0, exponentialDelay + jitter);
                }

                await new Promise(res => setTimeout(res, delay));
                return execute(attempt + 1);
              }
            }
            throw error;
          }
        };

        return execute(0);
      });
    }
  };
};
