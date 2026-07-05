"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestDeduper = void 0;
class RequestDeduper {
    constructor() {
        this.pendingRequests = new Map();
    }
    async getOrExecute(key, execute) {
        const pending = this.pendingRequests.get(key);
        if (pending) {
            return pending;
        }
        const promise = execute().finally(() => {
            this.pendingRequests.delete(key);
        });
        this.pendingRequests.set(key, promise);
        return promise;
    }
}
exports.RequestDeduper = RequestDeduper;
//# sourceMappingURL=RequestDeduper.js.map