import { describe, it, expect } from 'vitest';
import { QueueManager } from '../core/QueueManager';

// Helper to create a deferred promise / delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('QueueManager', () => {
  it('concurrency=1: tasks execute sequentially, never overlap', async () => {
    const q = new QueueManager(1);
    const order: number[] = [];
    let activeTaskCount = 0;
    let maxOverlap = 0;

    const createTask = (id: number, ms: number) => async () => {
      activeTaskCount++;
      maxOverlap = Math.max(maxOverlap, activeTaskCount);
      order.push(id);
      await delay(ms);
      activeTaskCount--;
      return id;
    };

    const p1 = q.add(createTask(1, 30));
    const p2 = q.add(createTask(2, 20));
    const p3 = q.add(createTask(3, 10));

    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxOverlap).toBe(1);
  });

  it('concurrency=3: at most 3 tasks active at the same time', async () => {
    const q = new QueueManager(3);
    let activeTaskCount = 0;
    let maxOverlap = 0;

    const createTask = (ms: number) => async () => {
      activeTaskCount++;
      maxOverlap = Math.max(maxOverlap, activeTaskCount);
      await delay(ms);
      activeTaskCount--;
    };

    const tasks = Array.from({ length: 6 }, () => q.add(createTask(20)));
    await Promise.all(tasks);

    expect(maxOverlap).toBeLessThanOrEqual(3);
    // At some point, robust parallel execution should have run 3 tasks at once
    expect(maxOverlap).toBe(3);
  });

  it('failed task rejects its promise AND next task still runs', async () => {
    const q = new QueueManager(1);
    const order: string[] = [];

    const t1 = q.add(async () => {
      order.push('t1-start');
      throw new Error('t1 failed');
    });

    const t2 = q.add(async () => {
      order.push('t2-run');
      return 'success';
    });

    await expect(t1).rejects.toThrow('t1 failed');
    const result2 = await t2;

    expect(result2).toBe('success');
    expect(order).toEqual(['t1-start', 't2-run']);
  });

  it('clear() rejects all queued tasks and empties the queue', async () => {
    const q = new QueueManager(1);
    const order: number[] = [];

    // First task starts immediately and keeps active
    const p1 = q.add(async () => {
      order.push(1);
      await delay(50);
      return 1;
    });

    // These two wait in the queue
    const p2 = q.add(async () => {
      order.push(2);
      return 2;
    });
    const p3 = q.add(async () => {
      order.push(3);
      return 3;
    });

    // Clear queue before p1 resolves
    q.clear();

    await expect(p2).rejects.toThrow('Queue cleared');
    await expect(p3).rejects.toThrow('Queue cleared');

    // p1 should still complete as it was already running
    const res1 = await p1;
    expect(res1).toBe(1);
    expect(order).toEqual([1]);
  });

  it('pause() stops new tasks from starting, resume() drains them', async () => {
    const q = new QueueManager(2);
    const order: number[] = [];

    q.pause();

    const p1 = q.add(async () => {
      order.push(1);
      return 1;
    });
    const p2 = q.add(async () => {
      order.push(2);
      return 2;
    });

    // Pause is active, so nothing should have run yet
    await delay(20);
    expect(order).toEqual([]);

    q.resume();

    const results = await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
    expect(order.sort()).toEqual([1, 2]);
  });

  it('setConcurrency() while tasks are running adjusts live limit', async () => {
    const q = new QueueManager(1);
    let activeTaskCount = 0;
    let maxOverlap = 0;

    const createTask = (ms: number) => async () => {
      activeTaskCount++;
      maxOverlap = Math.max(maxOverlap, activeTaskCount);
      await delay(ms);
      activeTaskCount--;
    };

    // Run first batch with concurrency=1
    const p1 = q.add(createTask(50));
    const p2 = q.add(createTask(50));

    // Wait a tick then increase concurrency to 2
    await delay(10);
    q.setConcurrency(2);

    const p3 = q.add(createTask(50));

    await Promise.all([p1, p2, p3]);

    // Originally maxOverlap was 1, but then increased to 2
    expect(maxOverlap).toBe(2);
  });

  it('activeCount reaches 0 after all tasks complete', async () => {
    const q = new QueueManager(2);
    expect((q as any).activeCount).toBe(0);

    const p1 = q.add(() => delay(10));
    const p2 = q.add(() => delay(10));
    expect((q as any).activeCount).toBe(2);

    await Promise.all([p1, p2]);
    expect((q as any).activeCount).toBe(0);
  });

  it('handles scenario where queue returns undefined/falsy shifted item cleanly', async () => {
    const q = new QueueManager(1);
    // Push an item manually
    (q as any).queue.push({
      task: async () => {},
      resolve: () => {},
      reject: () => {},
    });
    // Stub shift to return undefined
    (q as any).queue.shift = () => undefined;
    
    // Call process directly
    await (q as any).process();
    expect((q as any).activeCount).toBe(0);
  });
});
