export class RequestDeduper {
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
//# sourceMappingURL=RequestDeduper.js.map