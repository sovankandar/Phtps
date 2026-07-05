type QueueTask<T = any> = () => Promise<T>;

export class QueueManager {
  private queue: { task: QueueTask; resolve: (value: any) => void; reject: (reason?: any) => void }[] = [];
  private activeCount = 0;
  private concurrency = 1;
  private isPaused = false;

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  setConcurrency(limit: number): void {
    this.concurrency = limit;
    this.process();
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.process();
  }

  clear(): void {
    this.queue.forEach(item => item.reject(new Error('Queue cleared')));
    this.queue = [];
  }

  add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.isPaused || this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.activeCount++;
    const item = this.queue.shift();
    
    if (item) {
      try {
        const result = await item.task();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        this.activeCount--;
        this.process();
      }
    } else {
      this.activeCount--;
    }
  }
}
