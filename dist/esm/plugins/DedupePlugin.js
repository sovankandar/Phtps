import { RequestDeduper } from '../core/RequestDeduper';
import { UrlBuilder } from '../core/UrlBuilder';
export const DedupePlugin = () => {
    return {
        name: 'dedupe',
        install: (client) => {
            const deduper = new RequestDeduper();
            client.useMiddleware(async (config, next) => {
                if (config.deduplicate !== false && (config.method === 'GET' || !config.method) && !config.stream) {
                    const fullUrl = config._fullUrl ?? UrlBuilder.build(config);
                    const cacheKey = `${config.method || 'GET'}:${fullUrl}`;
                    return deduper.getOrExecute(cacheKey, () => next(config));
                }
                return next(config);
            });
        }
    };
};
//# sourceMappingURL=DedupePlugin.js.map