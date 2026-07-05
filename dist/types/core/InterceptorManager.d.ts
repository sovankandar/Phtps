import { Interceptor } from '../config/types';
export declare class InterceptorManager<V> {
    private interceptors;
    /**
     * Add a new interceptor to the stack
     * @param onFulfilled The function to handle the success case
     * @param onRejected The function to handle the error case
     * @returns The ID of the interceptor, used for ejecting
     */
    use(onFulfilled?: (value: V) => V | Promise<V>, onRejected?: (error: any) => any): number;
    eject(id: number): void;
    forEach(fn: (interceptor: Interceptor<V>, id: number) => void): void;
}
//# sourceMappingURL=InterceptorManager.d.ts.map