export class QueueManager {
    constructor(concurrency = 1) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = 1;
        this.isPaused = false;
        this.concurrency = concurrency;
    }
    setConcurrency(limit) {
        this.concurrency = limit;
        this.process();
    }
    pause() {
        this.isPaused = true;
    }
    resume() {
        this.isPaused = false;
        this.process();
    }
    clear() {
        this.queue.forEach(item => item.reject(new Error('Queue cleared')));
        this.queue = [];
    }
    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }
    async process() {
        if (this.isPaused || this.activeCount >= this.concurrency || this.queue.length === 0) {
            return;
        }
        this.activeCount++;
        const item = this.queue.shift();
        if (item) {
            try {
                const result = await item.task();
                item.resolve(result);
            }
            catch (error) {
                item.reject(error);
            }
            finally {
                this.activeCount--;
                this.process();
            }
        }
        else {
            this.activeCount--;
        }
    }
}
//# sourceMappingURL=QueueManager.js.map