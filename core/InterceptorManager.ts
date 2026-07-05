import { Interceptor } from '../config/types';

export class InterceptorManager<V> {
  private interceptors: Array<Interceptor<V> | null> = [];

  /**
   * Add a new interceptor to the stack
   * @param onFulfilled The function to handle the success case
   * @param onRejected The function to handle the error case
   * @returns The ID of the interceptor, used for ejecting
   */
  use(onFulfilled?: (value: V) => V | Promise<V>, onRejected?: (error: any) => any): number {
    this.interceptors.push({ onFulfilled, onRejected });
    return this.interceptors.length - 1;
  }

  eject(id: number): void {
    if (this.interceptors[id]) {
      this.interceptors[id] = null;
    }
  }

  forEach(fn: (interceptor: Interceptor<V>, id: number) => void): void {
    this.interceptors.forEach((interceptor, index) => {
      if (interceptor !== null) {
        fn(interceptor, index);
      }
    });
  }
}
