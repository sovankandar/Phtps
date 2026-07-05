import { InterceptorManager } from './InterceptorManager';
import { RequestDeduper } from './RequestDeduper';
import { CsrfManager } from './CsrfManager';
import { TokenRotationManager } from './TokenRotationManager';
import { PaginationManager } from './PaginationManager';
import { UrlBuilder } from './UrlBuilder';
import { MiddlewarePipeline } from './MiddlewarePipeline';
import { RequestExecutor } from './RequestExecuter';
import { defaultConfig } from '../config/defaultConfig';
export class HttpClient {
    constructor(config) {
        this.middlewares = [];
        this.isLocked = false;
        this.installedPlugins = new Set();
        this.config = { ...defaultConfig, ...config };
        this.interceptors = {
            request: new InterceptorManager(),
            response: new InterceptorManager(),
        };
        this.requestDeduper = new RequestDeduper();
        this.tokenRotationManager = new TokenRotationManager();
        this.tokenRotationManager.configure(this.config);
        this.paginationManager = new PaginationManager(this);
    }
    lock() {
        this.isLocked = true;
    }
    ensureNotLocked(methodName) {
        if (this.isLocked) {
            throw new Error(`[Phtps] Mutation attempted on a locked instance via "${methodName}". The default Phtps singleton is locked by default to prevent state leaks in SSR/multi-tenant environments. Please create a local instance using "createHttpClient()" instead.`);
        }
    }
    use(plugin) {
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
    create(config) {
        return new HttpClient({ ...this.config, ...config });
    }
    setConfig(config) {
        this.ensureNotLocked('setConfig');
        this.config = { ...this.config, ...config };
        if (config.cacheAdapter && this.cacheManager) {
            this.cacheManager.setAdapter(config.cacheAdapter);
        }
        this.tokenRotationManager.configure(this.config);
    }
    setGlobalHeader(key, value) {
        this.ensureNotLocked('setGlobalHeader');
        if (!this.config.headers) {
            this.config.headers = new Headers();
        }
        const headers = new Headers(this.config.headers);
        headers.set(key, value);
        this.config.headers = headers;
    }
    removeGlobalHeader(key) {
        this.ensureNotLocked('removeGlobalHeader');
        if (!this.config.headers)
            return;
        const headers = new Headers(this.config.headers);
        headers.delete(key);
        this.config.headers = headers;
    }
    clearCache() {
        if (this.cacheManager) {
            this.cacheManager.clear();
        }
        else {
            console.warn('[Phtps] CachePlugin is not installed. Cache clearing skipped.');
        }
    }
    destroy() {
        this.tokenRotationManager.destroy();
        if (this.queueManager) {
            this.queueManager.clear();
        }
        // Eject all interceptors to prevent memory leaks from closure captures
        this.interceptors.request.forEach((_, id) => this.interceptors.request.eject(id));
        this.interceptors.response.forEach((_, id) => this.interceptors.response.eject(id));
    }
    useMiddleware(middleware) {
        this.ensureNotLocked('useMiddleware');
        this.middlewares.push(middleware);
    }
    async request(config) {
        const response = await this.innerRequest(config);
        return response;
    }
    async stream(url, config) {
        const response = await this.innerRequest({ ...config, url, stream: true });
        return response;
    }
    async innerRequest(config) {
        const mergedHeaders = new Headers(this.config.headers);
        if (config?.headers) {
            const requestHeaders = new Headers(config.headers);
            requestHeaders.forEach((value, key) => {
                mergedHeaders.set(key, value);
            });
        }
        const method = (config.method || this.config.method || 'GET').toUpperCase();
        let mergedConfig = { ...this.config, ...config, headers: mergedHeaders, method };
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
            const executeFn = async (cfg) => {
                const pipeline = new MiddlewarePipeline(this.middlewares, (c) => this.executeWithQueue(c));
                return await pipeline.execute(cfg);
            };
            let response;
            if (mergedConfig.paginate) {
                response = await this.paginationManager.aggregate(mergedConfig, executeFn);
            }
            else {
                response = await executeFn(mergedConfig);
            }
            // 4. Handle Pagination Hooks (e.g. Prefetching)
            if (response && 'data' in response && !mergedConfig.stream) {
                this.paginationManager.handleResponse(response);
            }
            // 5. Apply response interceptors (Fulfilled)
            let responsePromise = Promise.resolve(response);
            this.interceptors.response.forEach((interceptor) => {
                if (interceptor.onFulfilled) {
                    responsePromise = responsePromise.then(interceptor.onFulfilled);
                }
            });
            return responsePromise;
        }
        catch (error) {
            // 5. Apply response interceptors (Rejected)
            let rejectedPromise = Promise.reject(error);
            this.interceptors.response.forEach((interceptor) => {
                if (interceptor.onRejected) {
                    rejectedPromise = rejectedPromise.catch(interceptor.onRejected);
                }
            });
            return rejectedPromise;
        }
    }
    async executeWithQueue(config) {
        const fullUrl = config._fullUrl ?? UrlBuilder.build(config);
        const method = config.method;
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
        const task = () => this.executeBase(config, cacheKey);
        const executeTask = () => {
            if (config.queue !== false && this.queueManager) {
                return this.queueManager.add(task);
            }
            else {
                return task();
            }
        };
        if (config.deduplicate !== false && method === 'GET') {
            return this.requestDeduper.getOrExecute(cacheKey, executeTask);
        }
        return executeTask();
    }
    async executeBase(config, cacheKey) {
        const response = await RequestExecutor.execute(config);
        if (config.useCache && config.method === 'GET' && !config.stream && this.cacheManager) {
            await this.cacheManager.set(cacheKey, response.data, config.cacheTTL || 60000);
        }
        return response;
    }
    get(url, config) {
        return this.request({ ...config, url, method: 'GET' });
    }
    post(url, data, config) {
        return this.request({ ...config, url, method: 'POST', body: data });
    }
    put(url, data, config) {
        return this.request({ ...config, url, method: 'PUT', body: data });
    }
    patch(url, data, config) {
        return this.request({ ...config, url, method: 'PATCH', body: data });
    }
    delete(url, config) {
        return this.request({ ...config, url, method: 'DELETE' });
    }
}
//# sourceMappingURL=HttpClient.js.map