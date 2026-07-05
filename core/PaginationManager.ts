import { HttpClientConfig, HttpResponse, PaginateConfig, IHttpClient } from '../config/types';

export interface PaginationStrategy {
  computeNextParams(config: HttpClientConfig, response: HttpResponse, items: any[], currentPageIndex: number, currentOffset: number): Record<string, any> | null;
  extractNextCursor?(config: PaginateConfig, response: HttpResponse): string | number | null;
}

export class PaginationManager {
  private client: IHttpClient;
  private strategies: Map<string, PaginationStrategy> = new Map();
  private onResponseHooks: ((response: HttpResponse) => void)[] = [];

  constructor(client: IHttpClient) {
    this.client = client;
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies() {
    this.strategies.set('page', {
      computeNextParams: (config, _res, _items, page) => {
        const paramName = (config.paginate as PaginateConfig).paramName || 'page';
        return { [paramName]: page + 1 };
      }
    });

    this.strategies.set('offset', {
      computeNextParams: (config, _res, items, _page, offset) => {
        const paramName = (config.paginate as PaginateConfig).paramName || 'offset';
        return { [paramName]: offset + items.length };
      }
    });

    this.strategies.set('cursor', {
      computeNextParams: (config, res) => {
        const pConfig = config.paginate as PaginateConfig;
        const paramName = pConfig.paramName || 'cursor';
        let nextCursor: any = null;

        if (pConfig.getNextCursor) {
          nextCursor = pConfig.getNextCursor(res);
        } else {
          const data = res.data as any;
          const field = pConfig.cursorField || 'cursor';
          nextCursor = data?.[field];
        }

        if (nextCursor === null || nextCursor === undefined || nextCursor === '') {
          return null;
        }

        return { [paramName]: nextCursor };
      }
    });
  }

  public registerStrategy(name: string, strategy: PaginationStrategy) {
    this.strategies.set(name, strategy);
  }

  public addOnResponseHook(hook: (response: HttpResponse) => void) {
    this.onResponseHooks.push(hook);
  }

  public async aggregate<T>(config: HttpClientConfig, next: (cfg: HttpClientConfig) => Promise<HttpResponse<T>>): Promise<HttpResponse<T[]>> {
    if (!config.paginate) return next(config) as any;

    const paginateConfig = typeof config.paginate === 'boolean' ? {} : config.paginate;
    const mode = paginateConfig.mode || 'aggregate';

    if (mode !== 'aggregate') return next(config) as any;

    const strategyName = paginateConfig.strategy || 'page';
    const limit = paginateConfig.limit ?? Infinity;
    // Default to a safe page count unless a limit was explicitly provided
    const maxPages = paginateConfig.limit !== undefined ? Infinity : 50;

    let allItems: any[] = [];
    let currentPageIndex = 1;
    let currentOffset = 0;
    let baseResponse: HttpResponse | null = null;
    let currentConfig = { ...config };

    while (allItems.length < limit && currentPageIndex <= maxPages) {
      const response = await next(currentConfig);
      if (!baseResponse) baseResponse = response;

      const items = this.extractItems(paginateConfig, response);
      if (items.length === 0) break;

      allItems = allItems.concat(items);

      if (!this.hasNextPage(paginateConfig, response, allItems)) break;

      if (allItems.length >= limit) {
        allItems = allItems.slice(0, limit);
        break;
      }

      const strategy = this.strategies.get(strategyName);
      if (!strategy) {
        throw new Error(`Pagination strategy "${strategyName}" not found. Did you forget to install a plugin?`);
      }

      const nextParams = strategy.computeNextParams(currentConfig, response, items, currentPageIndex, currentOffset);
      if (!nextParams) break;

      currentConfig = {
        ...currentConfig,
        params: { ...(currentConfig.params || {}), ...nextParams }
      };

      currentOffset += items.length;
      currentPageIndex++;
    }

    if (baseResponse) {
      return { ...baseResponse, data: allItems } as any;
    }

    throw new Error('Pagination iteration failed');
  }

  public handleResponse(response: HttpResponse): void {
    this.onResponseHooks.forEach(hook => hook(response));
  }

  public extractItems(config: PaginateConfig, res: HttpResponse): any[] {
    if (config.getItems) return config.getItems(res);
    if (Array.isArray(res.data)) return res.data;
    const d = res.data as any;
    if (d && Array.isArray(d.items)) return d.items;
    if (d && Array.isArray(d.data)) return d.data;
    if (d && Array.isArray(d.results)) return d.results;
    return res.data != null ? [res.data] : [];
  }

  public hasNextPage(config: PaginateConfig, res: HttpResponse, allItems: any[]): boolean {
    if (config.hasNextPage) return config.hasNextPage(res, allItems);

    const data = res.data as any;
    // Fix: If result data is null or a primitive, we can't safely assume it's paginated metadata
    if (!data || typeof data !== 'object') return false;

    // Check for explicit flags indicating more data exists
    const flags = ['hasNextPage', 'hasNext', 'hasMore', 'has_more', 'has_next_page'];
    for (const flag of flags) {
      if (data[flag] === false) return false;
      if (data[flag] === true) return true;
    }

    // Check total count against items fetched so far
    const totalFields = ['total', 'total_count', 'totalCount', 'count', 'total_results'];
    for (const field of totalFields) {
      if (typeof data[field] === 'number') {
        return allItems.length < data[field];
      }
    }

    // Default: Only continue if the user explicitly provided a limit, 
    // which signifies an intentional multi-page request. 
    // This prevents accidental infinite loops for plain-array APIs.
    return !!config.limit;
  }
}

