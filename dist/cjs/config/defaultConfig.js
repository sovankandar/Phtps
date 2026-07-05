"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.defaultConfig = {
    timeout: 10000,
    retries: 0,
    retryDelay: 1000,
    useCache: false,
    cacheTTL: 60000, // 1 minute
    deduplicate: true,
    csrf: false,
    headers: {
        'Accept': 'application/json',
    },
};
//# sourceMappingURL=defaultConfig.js.map