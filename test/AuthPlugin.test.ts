import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../core/HttpClient';
import { AuthPlugin } from '../plugins/AuthPlugin';
import { RequestExecutor } from '../core/RequestExecuter';
import { HttpClientConfig, HttpError } from '../config/types';

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

describe('AuthPlugin', () => {
  let executeSpy: any;

  beforeEach(() => {
    executeSpy = vi.spyOn(RequestExecutor, 'execute');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 triggers onTokenRefresh exactly once and retries successfully', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    const refreshSpy = vi.fn().mockResolvedValue('refreshed-token');

    let requestCount = 0;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      requestCount++;
      if (requestCount === 1) {
        throw createHttpError('Unauthorized', 401, config);
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'success-data',
        config,
      };
    });

    const res = await client.request({
      url: '/test',
      onTokenRefresh: refreshSpy,
    });

    expect(res.data).toBe('success-data');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(2); // 1 initial fail + 1 retry
  });

  it('retried request has updated Authorization header', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    const refreshSpy = vi.fn().mockResolvedValue('my-new-token');
    let capturedRetryHeaders: Headers | undefined;

    let requestCount = 0;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      requestCount++;
      if (requestCount === 1) {
        throw createHttpError('Unauthorized', 401, config);
      }
      capturedRetryHeaders = config.headers as Headers;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'success-data',
        config,
      };
    });

    const headers = new Headers();
    headers.set('Authorization', 'Bearer old-token');

    await client.request({
      url: '/test',
      headers,
      onTokenRefresh: refreshSpy,
    });

    expect(capturedRetryHeaders).toBeDefined();
    expect(capturedRetryHeaders?.get('Authorization')).toBe('Bearer my-new-token');
  });

  it('5 concurrent 401s: onTokenRefresh called exactly once, all 5 retried successfully', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    let resolveRefresh: (val: string) => void = () => {};
    const refreshPromise = new Promise<string>((resolve) => {
      resolveRefresh = resolve;
    });

    const refreshSpy = vi.fn().mockImplementation(() => refreshPromise);

    let initialRequestCount = 0;
    let retryRequestCount = 0;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      if (config._isRetry) {
        retryRequestCount++;
        return {
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          data: `retry-success-${retryRequestCount}`,
          config,
        };
      } else {
        initialRequestCount++;
        throw createHttpError('Unauthorized', 401, config);
      }
    });

    // Fire 5 requests concurrently
    const promises = Array.from({ length: 5 }, (_, i) =>
      client.request({
        url: `/test-${i}`,
        onTokenRefresh: refreshSpy,
      })
    );

    // Give microtasks time to execute so all 5 are in-flight and waiting
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Resolve the token refresh
    resolveRefresh('super-token');

    const results = await Promise.all(promises);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(initialRequestCount).toBe(5);
    expect(retryRequestCount).toBe(5);
    expect(results.map((r) => r.data)).toEqual([
      'retry-success-1',
      'retry-success-2',
      'retry-success-3',
      'retry-success-4',
      'retry-success-5',
    ]);
  });

  it('onTokenRefresh failure: all queued requests rejected, onRefreshFailure called', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    let rejectRefresh: (err: any) => void = () => {};
    const refreshPromise = new Promise<string>((_, reject) => {
      rejectRefresh = reject;
    });

    const refreshSpy = vi.fn().mockImplementation(() => refreshPromise);
    const failureSpy = vi.fn();

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      throw createHttpError('Unauthorized', 401, config);
    });

    // Fire 3 requests concurrently
    const promises = Array.from({ length: 3 }, (_, i) =>
      client.request({
        url: `/test-${i}`,
        onTokenRefresh: refreshSpy,
        onRefreshFailure: failureSpy,
      })
    );

    // Give microtasks time to execute so all are in-flight
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Fail the token refresh
    const refreshErr = new Error('Refresh Token Expired');
    rejectRefresh(refreshErr);

    for (const p of promises) {
      await expect(p).rejects.toThrow('Refresh Token Expired');
    }

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(failureSpy).toHaveBeenCalledTimes(3);
    expect(failureSpy).toHaveBeenCalledWith(refreshErr);
  });

  it('_isRetry=true on retry config — does not loop infinitely on second 401', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    const refreshSpy = vi.fn().mockResolvedValue('super-token');

    let requestCount = 0;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      requestCount++;
      throw createHttpError('Unauthorized', 401, config);
    });

    const promise = client.request({
      url: '/infinite-check',
      onTokenRefresh: refreshSpy,
    });

    await expect(promise).rejects.toThrow('Unauthorized');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(requestCount).toBe(2); // 1 initial + 1 retry
  });

  it('non-401 errors pass through without touching refresh logic', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    const refreshSpy = vi.fn();

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      throw createHttpError('Internal Server Error', 500, config);
    });

    const promise = client.request({
      url: '/test-500',
      onTokenRefresh: refreshSpy,
    });

    await expect(promise).rejects.toThrow('Internal Server Error');
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('no onTokenRefresh config: 401 passed through as normal error', async () => {
    const client = new HttpClient();
    client.use(AuthPlugin());

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      throw createHttpError('Unauthorized', 401, config);
    });

    const promise = client.request({
      url: '/no-refresh',
    });

    await expect(promise).rejects.toThrow('Unauthorized');
  });
});
