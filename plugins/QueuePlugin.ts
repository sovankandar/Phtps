import { IHttpClient, PhtpsPlugin } from '../config/types';
import { QueueManager } from '../core/QueueManager';

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
export const QueuePlugin = (options?: QueuePluginOptions): PhtpsPlugin => {
  return {
    name: 'queue',
    install: (client: IHttpClient) => {
      client.queueManager = new QueueManager(options?.concurrency ?? 1);
    }
  };
};
