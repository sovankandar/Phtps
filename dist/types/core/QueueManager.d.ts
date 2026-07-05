type QueueTask<T = any> = () => Promise<T>;
export declare class QueueManager {
    private queue;
    private activeCount;
    private concurrency;
    private isPaused;
    constructor(concurrency?: number);
    setConcurrency(limit: number): void;
    pause(): void;
    resume(): void;
    clear(): void;
    add<T>(task: QueueTask<T>): Promise<T>;
    private process;
}
export {};
//# sourceMappingURL=QueueManager.d.ts.map