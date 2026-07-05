"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationPlugin = void 0;
const extractCursor = (config, res) => {
    if (config.getNextCursor)
        return config.getNextCursor(res);
    const strategy = config.strategy || 'page';
    if (strategy === 'cursor') {
        const field = config.cursorField || 'nextCursor';
        const data = res.data;
        if (data && typeof data === 'object') {
            return data[field] || data.next_cursor || data.cursor || null;
        }
    }
    return null;
};
const PaginationPlugin = () => {
    return {
        name: 'pagination',
        install: (client) => {
            const manager = client.paginationManager;
            if (!manager)
                return;
            let activePrefetches = 0;
            // 1. Register advanced 'cursor' strategy
            manager.registerStrategy('cursor', {
                computeNextParams: (config, response) => {
                    if (!config.paginate)
                        return null;
                    const paginateConfig = typeof config.paginate === 'boolean' ? {} : config.paginate;
                    const cursor = extractCursor(paginateConfig, response);
                    if (!cursor)
                        return null;
                    const paramName = paginateConfig.paramName || 'cursor';
                    return { [paramName]: cursor };
                }
            });
            // 2. Add Prefetch logic as a response hook
            manager.addOnResponseHook((response) => {
                const config = response.config;
                if (!config.paginate || config.__isPrefetch)
                    return;
                const paginateConfig = typeof config.paginate === 'boolean' ? {} : config.paginate;
                const mode = paginateConfig.mode || 'aggregate';
                if (mode === 'prefetch') {
                    const depth = config.__prefetchDepth || 0;
                    const prefetchLimit = paginateConfig.limit || 1;
                    if (depth < prefetchLimit) {
                        const strategyName = paginateConfig.strategy || 'page';
                        const strategy = manager.strategies.get(strategyName);
                        if (!strategy)
                            return;
                        const items = manager.extractItems(paginateConfig, response);
                        const nextParams = strategy.computeNextParams(config, response, items, depth + 1, items.length * depth);
                        if (!nextParams || !manager.hasNextPage(paginateConfig, response, []))
                            return;
                        const rtt = Date.now() - (config.__startTime || Date.now());
                        const timingStrategy = paginateConfig.prefetchStrategy || 'adaptive';
                        const executePrefetch = () => {
                            const maxQueue = paginateConfig.maxPrefetchQueue || 3;
                            if (activePrefetches >= maxQueue)
                                return;
                            activePrefetches++;
                            const prefetchConfig = {
                                ...config,
                                params: { ...(config.params || {}), ...nextParams },
                                __isPrefetch: true,
                                __prefetchDepth: depth + 1,
                                useCache: true,
                                queue: true
                            };
                            client.request(prefetchConfig)
                                .finally(() => {
                                activePrefetches--;
                            })
                                .catch(() => { });
                        };
                        if (timingStrategy === 'idle' && typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                            window.requestIdleCallback(() => executePrefetch());
                        }
                        else if (timingStrategy === 'adaptive') {
                            const delay = Math.max(50, Math.min(rtt * 1.5, 3000));
                            setTimeout(executePrefetch, delay);
                        }
                        else {
                            setTimeout(executePrefetch, 0);
                        }
                    }
                }
            });
        }
    };
};
exports.PaginationPlugin = PaginationPlugin;
//# sourceMappingURL=PaginationPlugin.js.map