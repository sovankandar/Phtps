"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlBuilder = void 0;
class UrlBuilder {
    static build(config) {
        const { baseURL, url = '', params } = config;
        let fullUrl = '';
        if (url.startsWith('http')) {
            fullUrl = url;
        }
        else {
            const base = baseURL ? baseURL.replace(/\/+$/, '') : '';
            const path = url.startsWith('/') ? url : `/${url}`;
            fullUrl = base ? `${base}${path}` : url;
        }
        if (params && Object.keys(params).length > 0) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    searchParams.append(key, String(value));
                }
            });
            const queryString = searchParams.toString();
            if (queryString) {
                fullUrl += (fullUrl.indexOf('?') !== -1 ? '&' : '?') + queryString;
            }
        }
        return fullUrl || '/';
    }
}
exports.UrlBuilder = UrlBuilder;
//# sourceMappingURL=UrlBuilder.js.map