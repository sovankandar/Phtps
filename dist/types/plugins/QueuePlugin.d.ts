import { PhtpsPlugin } from '../config/types';
export interface QueuePluginOptions {
    /**
     * Maximum number of concurrent requests.
     * @default 1
     */
    concurrency?: number;
}
/**
 * Extends the Phtps client with an advanced Queue Manager.
 * Useful for limiting concurrency, preventing rate-limits, and pausing/resuming requests.
 */
export declare const QueuePlugin: (options?: QueuePluginOptions) => PhtpsPlugin;
//# sourceMappingURL=QueuePlugin.d.ts.map