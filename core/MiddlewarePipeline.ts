import { HttpClientConfig, HttpResponse, HttpStreamResponse, Middleware } from '../config/types';

export class MiddlewarePipeline {
  private middlewares: Middleware[];
  private finalHandler: (config: HttpClientConfig) => Promise<HttpResponse<any> | HttpStreamResponse<any>>;

  constructor(middlewares: Middleware[], finalHandler: (config: HttpClientConfig) => Promise<HttpResponse<any> | HttpStreamResponse<any>>) {
    this.middlewares = middlewares;
    this.finalHandler = finalHandler;
  }

  public async execute<T>(config: HttpClientConfig): Promise<HttpResponse<T> | HttpStreamResponse<T>> {
    const called = new Set<number>();
    const dispatch = async (i: number, currentConfig: HttpClientConfig): Promise<HttpResponse<any> | HttpStreamResponse<any>> => {
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
      } finally {
        called.delete(i);
      }
    };
    
    return dispatch(0, config) as Promise<HttpResponse<T> | HttpStreamResponse<T>>;
  }
}
