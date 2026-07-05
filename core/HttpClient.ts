import { HttpClientConfig, HttpResponse, HttpStreamResponse, Middleware, PhtpsPlugin, IHttpClient } from '../config/types';
import { InterceptorManager } from './InterceptorManager';
import { CacheManager } from './CacheManager';
import { RequestDeduper } from './RequestDeduper';
import { CsrfManager } from './CsrfManager';
import { TokenRotationManager } from './TokenRotationManager';
import { PaginationManager } from './PaginationManager';
import type { QueueManager } from './QueueManager';
import { UrlBuilder } from './UrlBuilder';
import { MiddlewarePipeline } from './MiddlewarePipeline';
import { RequestExecutor } from './RequestExecuter';
import { defaultConfig } from '../config/defaultConfig';

export class HttpClient implements IHttpClient {
  private config: HttpClientConfig;
  public interceptors: {
    request: InterceptorManager<HttpClientConfig>;
    response: InterceptorManager<HttpResponse | HttpStreamResponse>;
  };
  private middlewares: Middleware[] = [];
  private isLocked = false;
  private installedPlugins: Set<string> = new Set();
  public cacheManager?: CacheManager;
  public queueManager?: QueueManager;
  private requestDeduper: RequestDeduper;
  public tokenRotationManager: TokenRotationManager;
  private paginationManager: PaginationManager;

  constructor(config?: HttpClientConfig) {
    this.config = { ...defaultConfig, ...config };
    this.interceptors = {
      request: new InterceptorManager<HttpClientConfig>(),
      response: new InterceptorManager<HttpResponse | HttpStreamResponse>(),
    };
    this.requestDeduper = new RequestDeduper();
    this.tokenRotationManager = new TokenRotationManager();
    this.tokenRotationManager.configure(this.config);
    this.paginationManager = new PaginationManager(this);
  }


  public lock(): void {
    this.isLocked = true;
  }

  private ensureNotLocked(methodName: string): void {
    if (this.isLocked) {
      throw new Error(`[Phtps] Mutation attempted on a locked instance via "${methodName}". The default Phtps singleton is locked by default to prevent state leaks in SSR/multi-tenant environments. Please create a local instance using "createHttpClient()" instead.`);
    }
  }

  public use(plugin: PhtpsPlugin | PhtpsPlugin[]): this {
    this.ensureNotLocked('use');
    const plugins = Array.isArray(plugin) ? plugin : [plugin];
    plugins.forEach(p => {
      if (this.installedPlugins.has(p.name)) {
        console.warn(`[Phtps] Plugin "${p.name}" is already installed. Skipping to prevent redundant middleware layers.`);
        return;
      }
      this.installedPlugins.add(p.name);
      p.install(this);
    });
    return this;
  }

  public create(config?: Partial<HttpClientConfig>): HttpClient {
    return new HttpClient({ ...this.config, ...config });
  }

  public setConfig(config: Partial<HttpClientConfig>): void {
    this.ensureNotLocked('setConfig');
    this.config = { ...this.config, ...config };
    if (config.cacheAdapter && this.cacheManager) {
      this.cacheManager.setAdapter(config.cacheAdapter);
    }
    this.tokenRotationManager.configure(this.config);
  }

  public setGlobalHeader(key: string, value: string): void {
    this.ensureNotLocked('setGlobalHeader');
    if (!this.config.headers) {
      this.config.headers = new Headers();
    }
    const headers = new Headers(this.config.headers as HeadersInit);
    headers.set(key, value);
    this.config.headers = headers;
  }

  public removeGlobalHeader(key: string): void {
    this.ensureNotLocked('removeGlobalHeader');
    if (!this.config.headers) return;
    const headers = new Headers(this.config.headers as HeadersInit);
    headers.delete(key);
    this.config.headers = headers;
  }

  public clearCache(): void {
    if (this.cacheManager) {
      this.cacheManager.clear();
    } else {
      console.warn('[Phtps] CachePlugin is not installed. Cache clearing skipped.');
    }
  }

  public destroy(): void {
    this.tokenRotationManager.destroy();
    if (this.queueManager) {
      this.queueManager.clear();
    }
    // Eject all interceptors to prevent memory leaks from closure captures
    this.interceptors.request.forEach((_, id) => this.interceptors.request.eject(id));
    this.interceptors.response.forEach((_, id) => this.interceptors.response.eject(id));
  }

  public useMiddleware(middleware: Middleware) {
    this.ensureNotLocked('useMiddleware');
    this.middlewares.push(middleware);
  }

  public async request<T = any>(config: HttpClientConfig): Promise<HttpResponse<T>> {
    const response = await this.innerRequest<T>(config);
    return response as HttpResponse<T>;
  }

  public async stream<T = any>(url: string, config?: HttpClientConfig): Promise<HttpStreamResponse<T>> {
    const response = await this.innerRequest<T>({ ...config, url, stream: true });
    return response as HttpStreamResponse<T>;
  }

  private async innerRequest<T = any>(config: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>> {
    const mergedHeaders = new Headers(this.config.headers as HeadersInit);
    if (config?.headers) {
      const requestHeaders = new Headers(config.headers as HeadersInit);
      requestHeaders.forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    const method = (config.method || this.config.method || 'GET').toUpperCase();
    let mergedConfig: HttpClientConfig = { ...this.config, ...config, headers: mergedHeaders, method };

    // 1. Proactive Managers (CSRF, Token Rotation)
    mergedConfig = await CsrfManager.attach(mergedConfig);
    mergedConfig = await this.tokenRotationManager.interceptRequest(mergedConfig);

    // 2. Apply request interceptors
    let requestPromise = Promise.resolve(mergedConfig);
    this.interceptors.request.forEach((interceptor) => {
      if (interceptor.onFulfilled) {
        requestPromise = requestPromise.then(interceptor.onFulfilled);
      }
    });

    mergedConfig = await requestPromise;

    // 3. Execute Middleware Pipeline -> Queue -> Fetch
    try {
      const executeFn = async (cfg: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>> => {
        const pipeline = new MiddlewarePipeline(this.middlewares, (c) => this.executeWithQueue<T>(c));
        return await pipeline.execute<T>(cfg);
      };

      let response: HttpResponse<T> | HttpStreamResponse<T>;

      if (mergedConfig.paginate) {
        response = await this.paginationManager.aggregate<any>(mergedConfig, executeFn as any) as any;
      } else {
        response = await executeFn(mergedConfig);
      }
      
      // 4. Handle Pagination Hooks (e.g. Prefetching)
      if (response && 'data' in response && !mergedConfig.stream) {
        (this as any).paginationManager.handleResponse(response as HttpResponse);
      }

      // 5. Apply response interceptors (Fulfilled)
      let responsePromise = Promise.resolve(response);
      this.interceptors.response.forEach((interceptor) => {
        if (interceptor.onFulfilled) {
          responsePromise = responsePromise.then(interceptor.onFulfilled as any);
        }
      });
      return responsePromise as Promise<HttpResponse<T> | HttpStreamResponse<T>>;
    } catch (error: any) {
      // 5. Apply response interceptors (Rejected)
      let rejectedPromise: Promise<any> = Promise.reject(error);
      this.interceptors.response.forEach((interceptor) => {
        if (interceptor.onRejected) {
          rejectedPromise = rejectedPromise.catch(interceptor.onRejected);
        }
      });
      return rejectedPromise;
    }
  }

  private async executeWithQueue<T>(config: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>> {
    const fullUrl = config._fullUrl ?? UrlBuilder.build(config);
    const method = config.method!;
    const cacheKey = `${method}:${fullUrl}`;
    
    if (config.useCache && method === 'GET' && this.cacheManager) {
      const cachedData = await this.cacheManager.get(cacheKey);
      if (cachedData !== null) {
        return {
          data: cachedData,
          status: 200,
          statusText: 'OK (Cache)',
          headers: new Headers(),
          config
        };
      }
    }

    const task = () => this.executeBase<T>(config, cacheKey);

    const executeTask = () => {
      if (config.queue !== false && this.queueManager) {
        return this.queueManager.add(task);
      } else {
        return task();
      }
    };

    if (config.deduplicate !== false && method === 'GET') {
      return this.requestDeduper.getOrExecute<T>(cacheKey, executeTask);
    }

    return executeTask();
  }

  private async executeBase<T>(config: HttpClientConfig, cacheKey: string): Promise<HttpResponse<T> | HttpStreamResponse<T>> {
    const response = await RequestExecutor.execute<T>(config);
    
    if (config.useCache && config.method === 'GET' && !config.stream && this.cacheManager) {
      await this.cacheManager.set(cacheKey, (response as HttpResponse).data, config.cacheTTL || 60000);
    }
    
    return response;
  }

  get<T = any>(url: string, config?: HttpClientConfig) {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  post<T = any>(url: string, data?: any, config?: HttpClientConfig) {
    return this.request<T>({ ...config, url, method: 'POST', body: data });
  }

  put<T = any>(url: string, data?: any, config?: HttpClientConfig) {
    return this.request<T>({ ...config, url, method: 'PUT', body: data });
  }

  patch<T = any>(url: string, data?: any, config?: HttpClientConfig) {
    return this.request<T>({ ...config, url, method: 'PATCH', body: data });
  }

  delete<T = any>(url: string, config?: HttpClientConfig) {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }
}
