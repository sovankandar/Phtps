import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryPlugin } from '../plugins/RetryPlugin';
import { MiddlewarePipeline } from '../core/MiddlewarePipeline';
import { HttpClientConfig, HttpError, Middleware } from '../config/types';

const createHttpError = (message: string, status?: number, extra: Partial<HttpError> = {}): HttpError => {
  const err = new Error(message) as HttpError;
  if (status !== undefined) {
    err.response = {
      status,
      statusText: status === 401 ? 'Unauthorized' : 'Error',
      headers: new Headers(),
      data: null,
      config: {},
    };
  }
  Object.assign(err, extra);
  return err;
};

describe('RetryPlugin', () => {
  let registeredMiddleware: Middleware;
  let finalHandler: any;
  let pipeline: MiddlewarePipeline;

  beforeEach(() => {
    const mockClient = {
      useMiddleware: (middleware: Middleware) => {
        registeredMiddleware = middleware;
      },
    } as any;

    const plugin = RetryPlugin();
    plugin.install(mockClient);

    finalHandler = vi.fn();
    pipeline = new MiddlewarePipeline([registeredMiddleware], finalHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries=3: retries exactly 3 times then throws', async () => {
    const error = createHttpError('500 Server Error', 500);
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 0,
    };

    await expect(pipeline.execute(config)).rejects.toThrow('500 Server Error');
    expect(finalHandler).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('does NOT retry 401 errors (AuthPlugin owns these)', async () => {
    const error = createHttpError('401 Unauthorized', 401);
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 0,
    };

    await expect(pipeline.execute(config)).rejects.toThrow('401 Unauthorized');
    expect(finalHandler).toHaveBeenCalledTimes(1); // 401 should not trigger retry
  });

  it('does NOT retry cancelled requests (isCancel=true)', async () => {
    const error = createHttpError('Request Cancelled', undefined, { isCancel: true });
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 0,
    };

    await expect(pipeline.execute(config)).rejects.toThrow('Request Cancelled');
    expect(finalHandler).toHaveBeenCalledTimes(1); // Cancelled should not trigger retry
  });

  it('_isEncrypted and _isDecrypted undefined on each retry attempt', async () => {
    const error = createHttpError('500 Server Error', 500);
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 2,
      retryDelay: 0,
      _isEncrypted: true,
      _isDecrypted: true,
    };

    await expect(pipeline.execute(config)).rejects.toThrow('500 Server Error');
    expect(finalHandler).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) {
      const callConfig = finalHandler.mock.calls[i][0];
      expect(callConfig._isEncrypted).toBeUndefined();
      expect(callConfig._isDecrypted).toBeUndefined();
    }
  });

  it('exponential delay: attempt 1=1s, 2=2s, 3=4s (±jitter)', async () => {
    vi.useFakeTimers();
    // Mock Math.random to return 0.5 to keep jitter at exactly 0
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const error = createHttpError('500 Server Error', 500);
    let callCount = 0;
    
    finalHandler.mockImplementation(async () => {
      callCount++;
      if (callCount < 4) {
        throw error;
      }
      return { status: 200, statusText: 'OK', headers: new Headers(), data: `success-${callCount}`, config: {} };
    });

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 1000,
    };

    const promise = pipeline.execute(config);

    // Initial load/execution occurs
    await vi.advanceTimersByTimeAsync(0);
    expect(callCount).toBe(1);

    // First retry delay (attemptNumber=1): 1000 * Math.pow(2, 0) = 1000
    await vi.advanceTimersByTimeAsync(999);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(callCount).toBe(2);

    // Second retry delay (attemptNumber=2): 1000 * Math.pow(2, 1) = 2000
    await vi.advanceTimersByTimeAsync(1999);
    expect(callCount).toBe(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(callCount).toBe(3);

    // Third retry delay (attemptNumber=3): 1000 * Math.pow(2, 2) = 4000
    await vi.advanceTimersByTimeAsync(3999);
    expect(callCount).toBe(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(callCount).toBe(4);

    const res = await promise;
    expect(res.data).toBe('success-4');

    randomSpy.mockRestore();
  });

  it('custom retryCondition: respects false return (does not retry)', async () => {
    const error = createHttpError('500 Server Error', 500);
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 0,
      retryCondition: async (err) => {
        expect(err).toBe(error);
        return false;
      },
    };

    await expect(pipeline.execute(config)).rejects.toThrow('500 Server Error');
    expect(finalHandler).toHaveBeenCalledTimes(1);
  });

  it('custom retryDelay function: receives correct 1-indexed attempt number', async () => {
    const error = createHttpError('500 Server Error', 500);
    finalHandler.mockRejectedValue(error);

    const receivedAttempts: number[] = [];
    const receivedErrors: any[] = [];

    const config: HttpClientConfig = {
      retries: 2,
      retryDelay: (attempt, err) => {
        receivedAttempts.push(attempt);
        receivedErrors.push(err);
        return 0;
      },
    };

    await expect(pipeline.execute(config)).rejects.toThrow('500 Server Error');
    expect(finalHandler).toHaveBeenCalledTimes(3);
    expect(receivedAttempts).toEqual([1, 2]);
    expect(receivedErrors[0]).toBe(error);
    expect(receivedErrors[1]).toBe(error);
  });

  it('_isRetry=true config: skips retry entirely, passes through', async () => {
    const error = createHttpError('500 Server Error', 500);
    finalHandler.mockRejectedValue(error);

    const config: HttpClientConfig = {
      retries: 3,
      retryDelay: 0,
      _isRetry: true,
    };

    await expect(pipeline.execute(config)).rejects.toThrow('500 Server Error');
    expect(finalHandler).toHaveBeenCalledTimes(1); // Skips and forwards directly
  });

  it('succeeds on 3rd attempt: resolves correctly after 2 failures', async () => {
    const error = createHttpError('Temporary Error', 500);
    let attempts = 0;

    finalHandler.mockImplementation(async () => {
      attempts++;
      if (attempts <= 2) {
        throw error;
      }
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'finally-succeeded', config: {} };
    });

    const config: HttpClientConfig = {
      retries: 2,
      retryDelay: 0,
    };

    const res = await pipeline.execute(config);
    expect(res.data).toBe('finally-succeeded');
    expect(attempts).toBe(3); // 2 failures + 1 success
  });
});
