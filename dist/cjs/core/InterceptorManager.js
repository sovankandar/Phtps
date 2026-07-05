"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterceptorManager = void 0;
class InterceptorManager {
    constructor() {
        this.interceptors = [];
    }
    /**
     * Add a new interceptor to the stack
     * @param onFulfilled The function to handle the success case
     * @param onRejected The function to handle the error case
     * @returns The ID of the interceptor, used for ejecting
     */
    use(onFulfilled, onRejected) {
        this.interceptors.push({ onFulfilled, onRejected });
        return this.interceptors.length - 1;
    }
    eject(id) {
        if (this.interceptors[id]) {
            this.interceptors[id] = null;
        }
    }
    forEach(fn) {
        this.interceptors.forEach((interceptor, index) => {
            if (interceptor !== null) {
                fn(interceptor, index);
            }
        });
    }
}
exports.InterceptorManager = InterceptorManager;
//# sourceMappingURL=InterceptorManager.js.map