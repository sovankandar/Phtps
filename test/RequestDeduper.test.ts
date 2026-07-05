import { describe, it, expect } from 'vitest';
import { RequestDeduper } from '../core/RequestDeduper';
import { HttpResponse } from '../config/types';

// Helper to create delay and resolution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RequestDeduper', () => {
  it('two identical GET requests fired simultaneously share one network call', async () => {
    const deduper = new RequestDeduper();
    let callCount = 0;

    const execute = async (): Promise<HttpResponse<any>> => {
      callCount++;
      await delay(20);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'response_data', config: {} };
    };

    const p1 = deduper.getOrExecute('get::/api/users', execute);
    const p2 = deduper.getOrExecute('get::/api/users', execute);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(callCount).toBe(1);
    expect(res1.data).toBe('response_data');
    expect(res2.data).toBe('response_data');
    expect(res1).toBe(res2); // Should be the exact same response object structure / reference
  });

  it('after first resolves, second identical request makes a new network call', async () => {
    const deduper = new RequestDeduper();
    let callCount = 0;

    const execute = async (): Promise<HttpResponse<any>> => {
      callCount++;
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: `val-${callCount}`, config: {} };
    };

    const res1 = await deduper.getOrExecute('get::/api/users', execute);
    expect(callCount).toBe(1);
    expect(res1.data).toBe('val-1');

    // Key should have been cleared, so this runs execute again
    const res2 = await deduper.getOrExecute('get::/api/users', execute);
    expect(callCount).toBe(2);
    expect(res2.data).toBe('val-2');
  });

  it('when in-flight request fails, all waiting callers get the same rejection', async () => {
    const deduper = new RequestDeduper();
    let callCount = 0;

    const execute = async (): Promise<HttpResponse<any>> => {
      callCount++;
      await delay(20);
      throw new Error('Network Failure');
    };

    const p1 = deduper.getOrExecute('get::/api/users', execute);
    const p2 = deduper.getOrExecute('get::/api/users', execute);

    await expect(p1).rejects.toThrow('Network Failure');
    await expect(p2).rejects.toThrow('Network Failure');
    expect(callCount).toBe(1);
  });

  it('different URLs are NOT deduplicated', async () => {
    const deduper = new RequestDeduper();
    let callCount1 = 0;
    let callCount2 = 0;

    const execute1 = async (): Promise<HttpResponse<any>> => {
      callCount1++;
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'data-1', config: {} };
    };

    const execute2 = async (): Promise<HttpResponse<any>> => {
      callCount2++;
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'data-2', config: {} };
    };

    const p1 = deduper.getOrExecute('get::/api/users', execute1);
    const p2 = deduper.getOrExecute('get::/api/posts', execute2);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(callCount1).toBe(1);
    expect(callCount2).toBe(1);
    expect(res1.data).toBe('data-1');
    expect(res2.data).toBe('data-2');
  });

  it('same URL different params are NOT deduplicated (distinguished by keys)', async () => {
    const deduper = new RequestDeduper();
    let callCount1 = 0;
    let callCount2 = 0;

    const execute1 = async (): Promise<HttpResponse<any>> => {
      callCount1++;
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'user-1', config: {} };
    };

    const execute2 = async (): Promise<HttpResponse<any>> => {
      callCount2++;
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'user-2', config: {} };
    };

    // Since RequestDeduper is key-based, URL Builder or Interceptor manager produces different keys for different params.
    const key1 = 'get::/api/users?id=1';
    const key2 = 'get::/api/users?id=2';

    const p1 = deduper.getOrExecute(key1, execute1);
    const p2 = deduper.getOrExecute(key2, execute2);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(callCount1).toBe(1);
    expect(callCount2).toBe(1);
    expect(res1.data).toBe('user-1');
    expect(res2.data).toBe('user-2');
  });

  it('map is empty after all requests settle (no memory leak)', async () => {
    const deduper = new RequestDeduper();

    const execute = async (): Promise<HttpResponse<any>> => {
      await delay(10);
      return { status: 200, statusText: 'OK', headers: new Headers(), data: 'data', config: {} };
    };

    const p = deduper.getOrExecute('get::/api/leak-check', execute);
    
    // Check that pendingRequests has been populated
    expect((deduper as any).pendingRequests.size).toBe(1);

    await p;

    // Check that pendingRequests has been cleaned up
    expect((deduper as any).pendingRequests.size).toBe(0);
  });
});
