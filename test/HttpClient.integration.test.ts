import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpClient } from '../core/HttpClient';
import { RequestExecutor } from '../core/RequestExecuter';
import { HttpClientConfig, HttpError } from '../config/types';
import { AuthPlugin } from '../plugins/AuthPlugin';
import { RetryPlugin } from '../plugins/RetryPlugin';
import { CachePlugin } from '../plugins/CachePlugin';
import { DedupePlugin } from '../plugins/DedupePlugin';
import { QueuePlugin } from '../plugins/QueuePlugin';
import { EncryptionPlugin } from '../plugins/EncryptionPlugin';
import { SimpleCrypto } from '../utils/SimpleCrypto';

const createHttpError = (message: string, status: number, config: HttpClientConfig): HttpError => {
  const err = new Error(message) as HttpError;
  err.config = config;
  err.response = {
    status,
    statusText: status === 401 ? 'Unauthorized' : 'Error',
    headers: new Headers(),
    data: null,
    config,
  };
  return err;
};

describe('HttpClient Integration', () => {

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GET request: successful response with correct data shape', async () => {
    const client = new HttpClient();
    
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'hello' }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const res = await client.get('/items');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ message: 'hello' });
    expect(mockFetch).toHaveBeenCalled();
    
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain('/items');
    expect(calledInit.method).toBe('GET');
  });

  it('POST with body: serialized to JSON, Content-Type set', async () => {
    const client = new HttpClient();
    
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 201,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const payload = { x: 1, y: 2 };
    const res = await client.post('/submit', payload);

    expect(res.status).toBe(201);
    expect(res.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalled();

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain('/submit');
    expect(calledInit.method).toBe('POST');
    expect(calledInit.body).toBe(JSON.stringify(payload));
    
    const headers = calledInit.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('timeout fires: error.isTimeout=true, error.isCancel=false', async () => {
    const client = new HttpClient();
    
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((resolve, reject) => {
        const tId = setTimeout(() => {
          resolve(new Response(JSON.stringify({})));
        }, 80);

        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            clearTimeout(tId);
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      client.get('/timeout-url', { timeout: 5 })
    ).rejects.toSatisfy((err: any) => {
      return err.isTimeout === true && err.isCancel === false;
    });
  });

  it('AbortSignal cancel: error.isCancel=true, error.isTimeout=false', async () => {
    const client = new HttpClient();
    
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((resolve, reject) => {
        const tId = setTimeout(() => {
          resolve(new Response(JSON.stringify({})));
        }, 120);

        if (init?.signal) {
          if (init.signal.aborted) {
            clearTimeout(tId);
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          }
          init.signal.addEventListener('abort', () => {
            clearTimeout(tId);
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const controller = new AbortController();
    const promise = client.get('/cancel-url', { signal: controller.signal });
    
    setTimeout(() => controller.abort(), 5);

    await expect(promise).rejects.toSatisfy((err: any) => {
      return err.isCancel === true && err.isTimeout === false;
    });
  });

  it('RetryPlugin + AuthPlugin together: 401 handled by auth, 500 handled by retry', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());
    client.use(RetryPlugin());

    const refreshSpy = vi.fn().mockResolvedValue('new-token');

    let reqCount = 0;
    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      if (config.url === '/test-auth-retry') {
        if (reqCount === 1) {
          throw createHttpError('Unauthorized', 401, config);
        }
        return { status: 200, statusText: 'OK', headers: new Headers(), data: 'auth-ok', config };
      } else if (config.url === '/test-retry-only') {
        if (reqCount === 3) {
          throw createHttpError('Server Error', 500, config);
        }
        return { status: 200, statusText: 'OK', headers: new Headers(), data: 'retry-ok', config };
      }
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'fallback', config };
    });

    const res1 = await client.request({
      url: '/test-auth-retry',
      onTokenRefresh: refreshSpy,
    });
    expect(res1.data).toBe('auth-ok');
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    const res2 = await client.request({
      url: '/test-retry-only',
      retries: 1,
      retryDelay: 1,
    });
    expect(res2.data).toBe('retry-ok');
  });

  it('CachePlugin: second identical GET returns cached result, no network call', async () => {
    const client = new HttpClient();
    client.use(CachePlugin());

    let reqCount = 0;
    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: { count: reqCount },
        config,
      };
    });

    const res1 = await client.get('/cache-test', { useCache: true });
    const res2 = await client.get('/cache-test', { useCache: true });

    expect(res1.data).toEqual({ count: 1 });
    expect(res2.data).toEqual({ count: 1 });
    expect(reqCount).toBe(1);
  });

  it('DedupePlugin: two simultaneous GETs produce one network call', async () => {
    const client = new HttpClient();
    client.use(DedupePlugin());

    let reqCount = 0;
    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: { count: reqCount },
        config,
      };
    });

    const [res1, res2] = await Promise.all([
      client.get('/dedupe-test'),
      client.get('/dedupe-test')
    ]);

    expect(res1.data).toEqual({ count: 1 });
    expect(res2.data).toEqual({ count: 1 });
    expect(reqCount).toBe(1);
  });

  it('QueuePlugin concurrency=1: sequential execution confirmed', async () => {
    const client = new HttpClient();
    client.use(QueuePlugin({ concurrency: 1 }));

    let activeRequests = 0;
    let maxActiveRequests = 0;

    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      activeRequests++;
      if (activeRequests > maxActiveRequests) {
        maxActiveRequests = activeRequests;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
      activeRequests--;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'queued-ok',
        config,
      };
    });

    await Promise.all([
      client.get('/queue-test-1'),
      client.get('/queue-test-2'),
      client.get('/queue-test-3'),
    ]);

    expect(maxActiveRequests).toBe(1);
  });

  it('encryptionKey on client: body encrypted, response decrypted end-to-end', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const key = 'my-secret-key-123';
    const plainBody = { secretStuff: 'shh' };
    const plainResponse = { result: 'got it' };

    let capturedConfig: HttpClientConfig | undefined;

    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      capturedConfig = config;
      const responseHeaders = new Headers();
      responseHeaders.set('X-Phtps-Encrypted', 'true');

      const encryptedResData = await SimpleCrypto.encrypt(plainResponse, key);
      
      return {
        status: 200,
        statusText: 'OK',
        headers: responseHeaders,
        data: encryptedResData,
        config,
      };
    });

    const res = await client.request({
      url: '/encrypt-end-to-end',
      method: 'POST',
      body: plainBody,
      encryptionKey: key,
    });

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?._isEncrypted).toBe(true);

    const sentBodyObj = JSON.parse(capturedConfig?.body);
    expect(sentBodyObj.data).toBeDefined();
    const decryptedSentBody = await SimpleCrypto.decrypt(sentBodyObj.data, key);
    expect(decryptedSentBody).toEqual(plainBody);

    expect(res.data).toEqual(plainResponse);
  });

  it('lock(): setGlobalHeader throws after lock()', () => {
    const client = new HttpClient();
    client.setGlobalHeader('X-Some-Header', 'val');
    
    client.lock();
    
    expect(() => {
      client.setGlobalHeader('X-Other-Header', 'val2');
    }).toThrow('Mutation attempted on a locked instance');
  });

  it('create(): new instance inherits config but is independent', () => {
    const client = new HttpClient();
    client.setGlobalHeader('X-Default-Header', 'base-val');

    const childClient = client.create();
    
    let childHeaders = childClient['config'].headers as Headers;
    expect(childHeaders.get('X-Default-Header')).toBe('base-val');

    childClient.setGlobalHeader('X-Child-Header', 'child-val');
    
    let parentHeaders = client['config'].headers as Headers;
    expect(parentHeaders.has('X-Child-Header')).toBe(false);
    
    childHeaders = childClient['config'].headers as Headers;
    expect(childHeaders.get('X-Child-Header')).toBe('child-val');
  });

  it('duplicate plugin install: warns and skips, not double-installed', () => {
    const client = new HttpClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    client.use(RetryPlugin());
    client.use(RetryPlugin());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Phtps] Plugin "retry" is already installed')
    );
    expect(client['middlewares'].length).toBe(1);

    warnSpy.mockRestore();
  });

  it('interceptors: request interceptor can modify headers; response interceptor can transform data', async () => {
    const client = new HttpClient();

    client.interceptors.request.use((config) => {
      const headers = new Headers(config.headers as HeadersInit);
      headers.set('X-Intercepted', 'true');
      return { ...config, headers };
    });

    client.interceptors.response.use((res: any) => {
      return {
        ...res,
        data: { ...res.data, modifiedByInterceptor: true }
      };
    });

    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: { original: 'value' },
        config,
      };
    });

    const res = await client.get('/test-interceptor');

    expect((res.config.headers as Headers).get('X-Intercepted')).toBe('true');
    expect(res.data).toEqual({ original: 'value', modifiedByInterceptor: true });
  });

  it('middleware pipeline: runs in install order, next() passes config through', async () => {
    const client = new HttpClient();

    const executionOrder: string[] = [];

    client.useMiddleware(async (config, next) => {
      executionOrder.push('middleware-1-start');
      const res = await next(config);
      executionOrder.push('middleware-1-end');
      return res;
    });

    client.useMiddleware(async (config, next) => {
      executionOrder.push('middleware-2-start');
      const res = await next(config);
      executionOrder.push('middleware-2-end');
      return res;
    });

    vi.spyOn(RequestExecutor, 'execute').mockImplementation(async (config: HttpClientConfig) => {
      executionOrder.push('core-execution');
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'final-data',
        config,
      };
    });

    const res = await client.get('/test-middleware');

    expect(res.data).toBe('final-data');
    expect(executionOrder).toEqual([
      'middleware-1-start',
      'middleware-2-start',
      'core-execution',
      'middleware-2-end',
      'middleware-1-end',
    ]);
  });
});
