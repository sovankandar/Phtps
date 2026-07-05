"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewarePipeline = void 0;
class MiddlewarePipeline {
    constructor(middlewares, finalHandler) {
        this.middlewares = middlewares;
        this.finalHandler = finalHandler;
    }
    async execute(config) {
        const called = new Set();
        const dispatch = async (i, currentConfig) => {
            if (called.has(i)) {
                throw new Error('next() called multiple times in middleware');
            }
            called.add(i);
            try {
                if (i === this.middlewares.length) {
                    return await this.finalHandler(currentConfig);
                }
                const middleware = this.middlewares[i];
                return await middleware(currentConfig, (nextConfig) => {
                    // Clear downstream callers to allow subsequent retries
                    for (let j = i + 1; j <= this.middlewares.length; j++) {
                        called.delete(j);
                    }
                    return dispatch(i + 1, nextConfig);
                });
            }
            finally {
                called.delete(i);
            }
        };
        return dispatch(0, config);
    }
}
exports.MiddlewarePipeline = MiddlewarePipeline;
//# sourceMappingURL=MiddlewarePipeline.js.map