import { HttpClientConfig } from './types';

export const defaultConfig: Partial<HttpClientConfig> = {
  timeout: 10000,
  retries: 0,
  retryDelay: 1000,
  useCache: false,
  cacheTTL: 60000, // 1 minute
  deduplicate: true,
  csrf: false,
  headers: {
    'Accept': 'application/json',
  },
};
