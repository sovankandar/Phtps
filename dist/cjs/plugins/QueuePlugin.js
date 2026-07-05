"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuePlugin = void 0;
const QueueManager_1 = require("../core/QueueManager");
/**
 * Extends the Phtps client with an advanced Queue Manager.
 * Useful for limiting concurrency, preventing rate-limits, and pausing/resuming requests.
 */
const QueuePlugin = (options) => {
    return {
        name: 'queue',
        install: (client) => {
            client.queueManager = new QueueManager_1.QueueManager(options?.concurrency ?? 1);
        }
    };
};
exports.QueuePlugin = QueuePlugin;
//# sourceMappingURL=QueuePlugin.js.map