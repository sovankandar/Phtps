import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManager } from '../core/CacheManager';
import { MemoryCacheAdapter } from '../core/adapters/MemoryCacheAdapter';
import { LocalStorageCacheAdapter } from '../core/adapters/LocalStorageCacheAdapter';

describe('CacheManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('get() returns data before TTL expires', async () => {
    const cache = new CacheManager();
    await cache.set('test-key', 'some-data', 5000);

    const data = await cache.get('test-key');
    expect(data).toBe('some-data');
  });

  it('get() returns null after TTL expires (MemoryCacheAdapter)', async () => {
    const cache = new CacheManager(new MemoryCacheAdapter());
    await cache.set('temp', { x: 1 }, 1000);

    // Advance time by 1001ms
    vi.advanceTimersByTime(1001);

    const data = await cache.get('temp');
    expect(data).toBeNull();
  });

  it('set() with TTL=0 expires immediately', async () => {
    const cache = new CacheManager();
    await cache.set('instant', 'value', 0);

    // Advance by 1ms to make Date.now() > expiry
    vi.advanceTimersByTime(1);
    const data = await cache.get('instant');
    expect(data).toBeNull();
  });

  it('clear() removes all entries across all keys', async () => {
    const cache = new CacheManager();
    await cache.set('k1', 'v1', 10000);
    await cache.set('k2', 'v2', 10000);

    await cache.clear();

    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k2')).toBeNull();
  });

  it('delete() removes a specific entry', async () => {
    const cache = new CacheManager();
    await cache.set('k1', 'v1', 10000);
    await cache.delete('k1');
    expect(await cache.get('k1')).toBeNull();
  });

  it('setAdapter() swaps to new adapter — old data not accessible', async () => {
    const adapter1 = new MemoryCacheAdapter();
    const adapter2 = new MemoryCacheAdapter();
    const cache = new CacheManager(adapter1);

    await cache.set('shared-key', 'secret-agent', 5000);

    // Swap to new adapter
    cache.setAdapter(adapter2);
    expect(await cache.get('shared-key')).toBeNull();

    // Verify adapter 2 has its own isolated data
    await cache.set('shared-key', 'new-agent', 5000);
    expect(await cache.get('shared-key')).toBe('new-agent');

    // Swap back
    cache.setAdapter(adapter1);
    expect(await cache.get('shared-key')).toBe('secret-agent');
  });

  describe('LocalStorageCacheAdapter', () => {
    let mockStore: Record<string, string> = {};
    let quotaExceededErrorCount = 0;
    let fallbackError = false;

    beforeEach(() => {
      mockStore = {};
      quotaExceededErrorCount = 0;
      fallbackError = false;

      // Mock global window and localStorage
      const mockStorage = {
        getItem: (key: string) => mockStore[key] || null,
        setItem: (key: string, value: string) => {
          if (quotaExceededErrorCount > 0) {
            quotaExceededErrorCount--;
            const err = new Error('Quota Exceeded');
            err.name = 'QuotaExceededError';
            throw err;
          }
          if (fallbackError) {
            throw new Error('Generic Storage Error');
          }
          mockStore[key] = value;
        },
        removeItem: (key: string) => {
          delete mockStore[key];
        },
        clear: () => {
          mockStore = {};
        },
        key: (i: number) => Object.keys(mockStore)[i] || null,
        get length() {
          return Object.keys(mockStore).length;
        },
      };

      globalThis.window = {
        localStorage: mockStorage,
      } as any;
    });

    afterEach(() => {
      // @ts-expect-error - delete window object to clean up environment
      delete globalThis.window;
    });

    it('get() returns data before TTL expires', async () => {
      const adapter = new LocalStorageCacheAdapter();
      await adapter.set('ls-key', 'hello-ls', 5000);

      const data = await adapter.get('ls-key');
      expect(data).toBe('hello-ls');
    });

    it('LocalStorageCacheAdapter: expired entries removed on get()', async () => {
      const adapter = new LocalStorageCacheAdapter();
      await adapter.set('ls-key', 'hello-ls', 5000);

      vi.advanceTimersByTime(5001);

      const data = await adapter.get('ls-key');
      expect(data).toBeNull();
      // Verify removeItem was called
      expect(mockStore['phtps_cache_ls-key']).toBeUndefined();
    });

    it('get() returns null on invalid JSON stored', async () => {
      const adapter = new LocalStorageCacheAdapter();
      mockStore['phtps_cache_invalid'] = 'not-a-json';
      
      const data = await adapter.get('invalid');
      expect(data).toBeNull();
    });

    it('LocalStorageCacheAdapter: QuotaExceededError triggers clear-and-retry', async () => {
      const adapter = new LocalStorageCacheAdapter('test_prefix_');
      
      // We fill up some items first
      await adapter.set('pre1', 'val1', 10000);
      expect(mockStore['test_prefix_pre1']).toBeDefined();

      // Trigger QuotaExceededError once on next set. This should trigger cache clear then retry succeeds.
      quotaExceededErrorCount = 1;
      
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await adapter.set('pre2', 'val2', 10000);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Phtps] LocalStorage quota exceeded')
      );
      // Pre1 should be cleared because we ran clear()
      expect(mockStore['test_prefix_pre1']).toBeUndefined();
      // Pre2 should be set successfully on the retry
      expect(mockStore['test_prefix_pre2']).toBeDefined();
    });

    it('LocalStorageCacheAdapter: logs error if quota exceeded retry also fails', async () => {
      const adapter = new LocalStorageCacheAdapter('test_prefix_');
      
      // quotaExceededErrorCount = 2 means it will throw on first try AND retry!
      quotaExceededErrorCount = 2;
      
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await adapter.set('pre3', 'val3', 10000);

      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Phtps] Failed to store data even after clearing cache.'),
        expect.any(Error)
      );
    });

    it('delete() removes specific entry from LocalStorage', async () => {
      const adapter = new LocalStorageCacheAdapter();
      await adapter.set('k1', 'v1', 5000);
      expect(mockStore['phtps_cache_k1']).toBeDefined();

      await adapter.delete('k1');
      expect(mockStore['phtps_cache_k1']).toBeUndefined();
    });

    it('clear() only removes items matching prefix', async () => {
      const adapter = new LocalStorageCacheAdapter('foo_');
      await adapter.set('k1', 'v1', 5000);
      
      // Add a non-prefix item physically to mockStore
      mockStore['bar_k2'] = 'do-not-touch';

      await adapter.clear();

      expect(mockStore['foo_k1']).toBeUndefined();
      expect(mockStore['bar_k2']).toBe('do-not-touch');
    });

    it('does nothing / returns null when window is undefined', async () => {
      // @ts-expect-error - delete window object to simulate non-browser environment
      delete globalThis.window;

      const adapter = new LocalStorageCacheAdapter();
      
      // Should handle window undefined gracefully
      await adapter.set('k1', 'v1', 5000);
      const data = await adapter.get('k1');
      expect(data).toBeNull();

      await adapter.delete('k1');
      await adapter.clear();
    });
  });
});
