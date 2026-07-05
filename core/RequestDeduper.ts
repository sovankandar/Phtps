import { HttpResponse, HttpStreamResponse } from '../config/types';

export class RequestDeduper {
  private pendingRequests: Map<string, Promise<HttpResponse<any> | HttpStreamResponse<any>>> = new Map();

  public async getOrExecute<T>(key: string, execute: () => Promise<HttpResponse<T> | HttpStreamResponse<T>>): Promise<HttpResponse<T> | HttpStreamResponse<T>> {
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending as Promise<HttpResponse<T> | HttpStreamResponse<T>>;
    }

    const promise = execute().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise as Promise<HttpResponse<T> | HttpStreamResponse<T>>;
  }
}
