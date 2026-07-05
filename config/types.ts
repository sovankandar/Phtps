export interface CacheAdapter {
  get(key: string): any | Promise<any>;
  set(key: string, value: any, ttl: number): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface HttpClientConfig extends Omit<RequestInit, 'body' | 'cache' | 'signal'> {
  url?: string;
  baseURL?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number | ((attempt: number, error: HttpError) => number);
  retryCondition?: (error: HttpError) => boolean | Promise<boolean>;
  useCache?: boolean;
  cacheTTL?: number;
  cacheAdapter?: CacheAdapter;
  encryptionKey?: string;
  encryptPayload?: boolean;
  decryptResponse?: boolean;
  params?: Record<string, string | number | boolean>;
  onTokenRefresh?: () => Promise<string>;
  onRefreshFailure?: (error: any) => void | Promise<void>;
  body?: any;
  signal?: AbortSignal;
  queue?: boolean;
  deduplicate?: boolean;
  _fullUrl?: string;
  _isRetry?: boolean;
  _isEncrypted?: boolean;
  _isDecrypted?: boolean;
  __isPrefetch?: boolean;
  __startTime?: number;
  __prefetchDepth?: number;
  onUploadProgress?: (event: HttpProgressEvent) => void;
  onDownloadProgress?: (event: HttpProgressEvent) => void;
  stream?: boolean;
  streamType?: 'raw' | 'text' | 'json' | 'sse';
  csrf?: CsrfConfig | boolean;
  tokenRotation?: TokenRotationConfig;
  payment?: PaymentRequestConfig;
  paginate?: PaginateConfig | boolean;
}

export interface PaginateConfig {
  /** Mode: 'aggregate' loops and returns all items. 'prefetch' loads upcoming pages silently into cache. Default: 'aggregate' */
  mode?: 'aggregate' | 'prefetch';
  /** Pagination Strategy. Default: 'page' */
  strategy?: 'page' | 'cursor' | 'offset';
  /** Param name to inject into query. Defaults to 'page', 'cursor', or 'offset' based on strategy. */
  paramName?: string;
  /** Field name in response containing the cursor/next token. (e.g., 'nextCursor') */
  cursorField?: string;
  /** Max items to fetch (aggregate mode) or max upcoming pages to load (prefetch mode). Default: Infinity / 1 */
  limit?: number;
  /** Size of each page (useful for offset strategy calculating next offsets) */
  pageSize?: number;
  /** Custom function to extract the array of items from a response payload */
  getItems?: (response: HttpResponse) => any[];
  /** Custom function to extract the next cursor/page/offset from a response */
  getNextCursor?: (response: HttpResponse) => string | number | null;
  /** Custom function to check if there is a next page based on the response payload and current aggregate */
  hasNextPage?: (response: HttpResponse, allItems: any[]) => boolean;
  /** (Prefetch mode only) Timing strategy. Default: 'adaptive' */
  prefetchStrategy?: 'immediate' | 'adaptive' | 'idle';
  /** (Prefetch mode only) Max concurrent prefetch requests allowed in the queue. Default: 3 */
  maxPrefetchQueue?: number;
}

export interface PaymentRequestConfig {
  idempotencyKey?: string | false;
  skipRateLimit?: boolean;
}

export interface TokenRotationConfig {
  enabled?: boolean;
  getToken?: () => string | Promise<string | undefined> | undefined;
  getExpiration?: (token: string) => number | null | Promise<number | null>; // Returns Epoch Timestamp in MS
  onRefresh: () => Promise<string>; // Function to execute the refresh
  refreshWindow?: number; // Margin in ms before expiry to trigger refresh (default: 60000)
  autoRefreshBackground?: boolean; // Set a silent background timer
  headerName?: string; // Default: 'Authorization'
  headerPrefix?: string; // Default: 'Bearer '
}

export interface CsrfConfig {
  enabled?: boolean;
  cookieName?: string;
  headerName?: string;
  token?: string | (() => string | Promise<string>);
  methods?: string[];
  originWhitelist?: string[];
  strict?: boolean;
  storageKey?: string;
  onTokenMissing?: () => string | Promise<string | undefined> | undefined;
}

export interface HttpStreamResponse<T = any> {
  data: ReadableStream<T>;
  status: number;
  statusText: string;
  headers: Headers;
  config: HttpClientConfig;
  cancel: () => void;
}

export interface HttpProgressEvent {
  loaded: number;
  total: number;
  progress: number; // 0 to 1
  bytes: number;
  rate?: number; // bytes per second
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: HttpClientConfig;
}

export interface HttpError extends Error {
  response?: HttpResponse;
  config?: HttpClientConfig;
  isCancel?: boolean;
  isTimeout?: boolean;
}

export interface Interceptor<V> {
  onFulfilled?: (value: V) => V | Promise<V>;
  onRejected?: (error: any) => any;
}

export type MiddlewareNext = (config: HttpClientConfig) => Promise<HttpResponse | HttpStreamResponse>;
export type Middleware = (config: HttpClientConfig, next: MiddlewareNext) => Promise<HttpResponse | HttpStreamResponse>;

export interface IInterceptorManager<V> {
  use(onFulfilled?: (value: V) => V | Promise<V>, onRejected?: (error: any) => any): number;
  eject(id: number): void;
}

export interface ICacheManager {
  set(key: string, data: any, ttl: number): Promise<void>;
  get(key: string): Promise<any | null>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  setAdapter(adapter: CacheAdapter): void;
}

export interface IQueueManager {
  add<T>(task: () => Promise<T>): Promise<T>;
  setConcurrency(limit: number): void;
  pause(): void;
  resume(): void;
  clear(): void;
}

export interface IHttpClient {
  interceptors: {
    request: IInterceptorManager<HttpClientConfig>;
    response: IInterceptorManager<HttpResponse | HttpStreamResponse>;
  };
  useMiddleware(middleware: Middleware): void;
  setConfig(config: Partial<HttpClientConfig>): void;
  request<T = any>(config: HttpClientConfig): Promise<HttpResponse<T>>;
  cacheManager?: ICacheManager;
  queueManager?: IQueueManager;
  tokenRotationManager?: any; // Using any to avoid circular dependency or complex type import here
  get<T = any>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;
  post<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
  put<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
  patch<T = any>(url: string, data?: any, config?: HttpClientConfig): Promise<HttpResponse<T>>;
  delete<T = any>(url: string, config?: HttpClientConfig): Promise<HttpResponse<T>>;
  destroy(): void;
}

export interface PhtpsPlugin {
  name: string;
  install: (client: IHttpClient) => void;
}
