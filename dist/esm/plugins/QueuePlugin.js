import { QueueManager } from '../core/QueueManager';
/**
 * Extends the Phtps client with an advanced Queue Manager.
 * Useful for limiting concurrency, preventing rate-limits, and pausing/resuming requests.
 */
export const QueuePlugin = (options) => {
    return {
        name: 'queue',
        install: (client) => {
            client.queueManager = new QueueManager(options?.concurrency ?? 1);
        }
    };
};
//# sourceMappingURL=QueuePlugin.js.map