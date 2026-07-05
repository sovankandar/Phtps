"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedupePlugin = void 0;
const RequestDeduper_1 = require("../core/RequestDeduper");
const UrlBuilder_1 = require("../core/UrlBuilder");
const DedupePlugin = () => {
    return {
        name: 'dedupe',
        install: (client) => {
            const deduper = new RequestDeduper_1.RequestDeduper();
            client.useMiddleware(async (config, next) => {
                if (config.deduplicate !== false && (config.method === 'GET' || !config.method) && !config.stream) {
                    const fullUrl = config._fullUrl ?? UrlBuilder_1.UrlBuilder.build(config);
                    const cacheKey = `${config.method || 'GET'}:${fullUrl}`;
                    return deduper.getOrExecute(cacheKey, () => next(config));
                }
                return next(config);
            });
        }
    };
};
exports.DedupePlugin = DedupePlugin;
//# sourceMappingURL=DedupePlugin.js.map