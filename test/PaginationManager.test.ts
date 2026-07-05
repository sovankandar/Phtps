import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../core/HttpClient';
import { PaginationPlugin } from '../plugins/PaginationPlugin';
import { RequestExecutor } from '../core/RequestExecuter';
import { HttpClientConfig, HttpResponse } from '../config/types';

const createHttpResponse = (data: any, config: HttpClientConfig): HttpResponse => {
  return {
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    data,
    config,
  };
};

describe('PaginationManager & PaginationPlugin', () => {
  let executeSpy: any;

  beforeEach(() => {
    executeSpy = vi.spyOn(RequestExecutor, 'execute');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('page strategy: fetches pages 1,2,3 — stops when items empty', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    const requestedPages: number[] = [];

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const page = Number(config.params?.page ?? 1);
      requestedPages.push(page);

      if (page === 1) {
        return createHttpResponse([1, 2, 3], config);
      } else if (page === 2) {
        return createHttpResponse([4, 5, 6], config);
      } else if (page === 3) {
        return createHttpResponse([7, 8, 9], config);
      } else {
        return createHttpResponse([], config);
      }
    });

    const res = await client.request({
      url: '/items',
      paginate: {
        strategy: 'page',
        limit: 100, // allow all items to be retrieved
      },
    });

    expect(res.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(requestedPages).toEqual([1, 2, 3, 4]); // 1, 2, 3 fetched; 4 returned empty causing break
  });

  it('cursor strategy: passes cursor from response into next request params', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    const requestedCursors: any[] = [];

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const cursor = config.params?.cursor || null;
      requestedCursors.push(cursor);

      if (cursor === null) {
        return createHttpResponse({ items: ['a', 'b'], nextCursor: 'cursor-abc' }, config);
      } else if (cursor === 'cursor-abc') {
        return createHttpResponse({ items: ['c', 'd'], nextCursor: 'cursor-xyz' }, config);
      } else if (cursor === 'cursor-xyz') {
        return createHttpResponse({ items: ['e'], nextCursor: null }, config);
      }
      return createHttpResponse({ items: [] }, config);
    });

    const res = await client.request({
      url: '/cursor-endpoint',
      paginate: {
        strategy: 'cursor',
        limit: 100,
      },
    });

    expect(res.data).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(requestedCursors).toEqual([null, 'cursor-abc', 'cursor-xyz']);
  });

  it('offset strategy: increments offset by items.length each page', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    const requestedOffsets: number[] = [];

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const offset = Number(config.params?.offset ?? 0);
      requestedOffsets.push(offset);

      if (offset === 0) {
        return createHttpResponse([11, 22, 33], config);
      } else if (offset === 3) {
        return createHttpResponse([44, 55], config);
      } else if (offset === 5) {
        return createHttpResponse([66], config);
      } else {
        return createHttpResponse([], config);
      }
    });

    const res = await client.request({
      url: '/offset-endpoint',
      paginate: {
        strategy: 'offset',
        limit: 100,
      },
    });

    expect(res.data).toEqual([11, 22, 33, 44, 55, 66]);
    expect(requestedOffsets).toEqual([0, 3, 5, 6]);
  });

  it('limit=10: stops after 10 items even if more pages exist', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    let reqCount = 0;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      return createHttpResponse([1, 2, 3, 4], config);
    });

    const res = await client.request({
      url: '/limit-endpoint',
      paginate: {
        strategy: 'page',
        limit: 10,
      },
    });

    // Each page returns 4 items.
    // Page 1: 4 items (limit 10, not met)
    // Page 2: 8 items (limit 10, not met)
    // Page 3: 12 items (limit 10, met) -> slices to exactly 10
    expect(res.data).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 1, 2]);
    expect(reqCount).toBe(3);
  });

  it('hasNextPage=false in response: stops immediately', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    let reqCount = 0;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      return createHttpResponse({
        items: [100, 200],
        hasNextPage: false,
      }, config);
    });

    const res = await client.request({
      url: '/has-next-endpoint',
      paginate: {
        strategy: 'page',
        limit: 10,
      },
    });

    expect(res.data).toEqual([100, 200]);
    expect(reqCount).toBe(1); // should not fetch second page
  });

  it('no limit + no pagination signals + no hasNextPage: stops at 50 pages max', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    let reqCount = 0;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      return createHttpResponse([99], config);
    });

    const res = await client.request({
      url: '/safety-endpoint',
      paginate: {
        strategy: 'page',
        // we provide a custom hasNextPage returning true to allow continuation, but no limit
        hasNextPage: () => true,
      },
    });

    expect(res.data.length).toBe(50);
    expect(reqCount).toBe(50);
  });

  it('returns { ...baseResponse, data: allItems } — no mutation of baseResponse', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    let originalResponseReference: HttpResponse | null = null;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const page = Number(config.params?.page ?? 1);
      const res = createHttpResponse([page * 10], config);
      res.headers.set('X-Unique-Header', 'test-value');
      if (page === 1) {
        originalResponseReference = res;
      }
      return res;
    });

    const res = await client.request({
      url: '/mutation-check',
      paginate: {
        strategy: 'page',
        limit: 2,
      },
    });

    expect(res).not.toBe(originalResponseReference); // New response object should be returned
    expect(res.data).toEqual([10, 20]);
    expect(res.headers.get('X-Unique-Header')).toBe('test-value');

    // Verify original object remains untouched
    expect(originalResponseReference).toBeDefined();
    expect((originalResponseReference as any).data).toEqual([10]);
  });

  it('getItems() custom extractor: uses returned array', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const page = config.params?.page || 1;
      if (page === 1) {
        return createHttpResponse({ payload: { nested: ['apple', 'banana'] } }, config);
      }
      return createHttpResponse({ payload: { nested: [] } }, config);
    });

    const res = await client.request({
      url: '/custom-extractor',
      paginate: {
        strategy: 'page',
        getItems: (response) => response.data.payload.nested,
      },
    });

    expect(res.data).toEqual(['apple', 'banana']);
  });

  it('total field in response: stops when allItems.length >= total', async () => {
    const client = new HttpClient();
    client.use(PaginationPlugin());

    let reqCount = 0;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      reqCount++;
      const page = config.params?.page || 1;
      if (page === 1) {
        return createHttpResponse({ results: ['x', 'y', 'z'], total: 5 }, config);
      } else if (page === 2) {
        return createHttpResponse({ results: ['w', 'v'], total: 5 }, config);
      }
      return createHttpResponse({ results: ['u'], total: 5 }, config);
    });

    const res = await client.request({
      url: '/total-field-endpoint',
      paginate: {
        strategy: 'page',
        limit: 100,
      },
    });

    // Page 1: 3 items (total 5). 3 < 5 -> fetch page 2
    // Page 2: 2 items (total 5). 3+2 = 5 >= 5 -> stops!
    expect(res.data).toEqual(['x', 'y', 'z', 'w', 'v']);
    expect(reqCount).toBe(2);
  });
});
