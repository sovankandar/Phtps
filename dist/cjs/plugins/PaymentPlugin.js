"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentPlugin = void 0;
class RateLimiter {
    constructor(max, windowMs, store) {
        this.max = max;
        this.windowMs = windowMs;
        this.store = store;
        this.requests = [];
    }
    async check() {
        if (this.store) {
            await this.store.check('payment-plugin', this.max, this.windowMs);
            return;
        }
        const now = Date.now();
        this.requests = this.requests.filter(t => now - t < this.windowMs);
        if (this.requests.length >= this.max) {
            throw new Error(`[PaymentPlugin] SECURITY BLOCK: Rate limit exceeded. Throttling requests to prevent DOS or accidental looping. NOTE: This is a PER-PROCESS limit.`);
        }
        this.requests.push(now);
    }
}
/** Helper to generate fallback UUIDs if crypto.randomUUID isn't available */
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
/** Web Crypto HMAC SHA-256 wrapper */
const signPayload = async (secret, payload, timestamp) => {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        console.warn('[PaymentPlugin] Web Crypto API not available. Cannot sign request.');
        return '';
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    // Hash the timestamp + payload together (AWS style)
    const dataToSign = `${timestamp}.${payload}`;
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};
/** Deep-clones and scrubs sensitive CVV/Card data from objects for safe logging */
const scrubSensitiveData = (obj) => {
    if (typeof obj !== 'object' || obj === null)
        return obj;
    if (Array.isArray(obj))
        return obj.map(scrubSensitiveData);
    const scrubbed = { ...obj };
    const sensitiveKeys = ['cvv', 'cvc', 'cardnumber', 'card_number', 'token', 'secret', 'password'];
    for (const key of Object.keys(scrubbed)) {
        if (sensitiveKeys.includes(key.toLowerCase())) {
            scrubbed[key] = '***MASKED***';
        }
        else if (typeof scrubbed[key] === 'object') {
            scrubbed[key] = scrubSensitiveData(scrubbed[key]);
        }
    }
    return scrubbed;
};
/**
 * Highly secure, zero-trust Payment Plugin targeting API protections,
 * Idempotency, HMAC Request signing, and throttling.
 */
const PaymentPlugin = (options = {}) => {
    const rateLimiter = options.rateLimit ? new RateLimiter(options.rateLimit.maxRequests, options.rateLimit.windowMs, options.rateLimit.store) : null;
    return {
        name: 'payment-security',
        install: (client) => {
            // 1. Request Interceptor (Guards & Injection)
            client.interceptors.request.use(async (config) => {
                // Rate Limiter
                if (rateLimiter && config.payment?.skipRateLimit !== true) {
                    await rateLimiter.check();
                }
                const headers = new Headers(config.headers || {});
                // Environment Isolation
                if (options.environment) {
                    headers.set('X-Environment', options.environment);
                }
                // Timestamp Injection (MITM Replay Protection)
                const currentTimestamp = Math.floor(Date.now() / 1000).toString();
                if (options.timestamp !== false) {
                    headers.set('X-Timestamp', currentTimestamp);
                }
                // Idempotency (Prevent double charge)
                if (options.idempotency !== false && config.payment?.idempotencyKey !== false) {
                    let idempotencyKey = '';
                    if (config.payment?.idempotencyKey) {
                        idempotencyKey = config.payment.idempotencyKey;
                    }
                    else if (typeof options.idempotency === 'function') {
                        idempotencyKey = options.idempotency();
                    }
                    else {
                        idempotencyKey = generateUUID();
                    }
                    headers.set('Idempotency-Key', idempotencyKey);
                }
                // Request Signing (AWS Style Zero-Trust)
                if (options.signRequests) {
                    const payloadStr = config.body ? typeof config.body === 'string' ? config.body : JSON.stringify(config.body) : '';
                    let signature = '';
                    if (options.customSigner) {
                        signature = await Promise.resolve(options.customSigner(payloadStr, currentTimestamp));
                    }
                    else if (options.secretKey) {
                        signature = await signPayload(options.secretKey, payloadStr, currentTimestamp);
                    }
                    if (signature) {
                        headers.set('X-Signature', signature);
                    }
                }
                return { ...config, headers };
            });
            // 2. Response Interceptor (Data Protection & Scrubbing)
            if (options.maskSensitiveData !== false) {
                client.interceptors.response.use(response => response, error => {
                    // Scrub sensitive payment info out of the configuration object attached to errors
                    // This guarantees console.error(error) never leaks the user CVV or Card Data
                    if (error && error.config && error.config.body) {
                        try {
                            let parsedBody = typeof error.config.body === 'string' ? JSON.parse(error.config.body) : error.config.body;
                            parsedBody = scrubSensitiveData(parsedBody);
                            error.config.body = JSON.stringify(parsedBody);
                        }
                        catch {
                            // Ignore JSON parse errors (might be form data, etc.)
                            error.config.body = '***MASKED_PAYLOAD***';
                        }
                    }
                    return Promise.reject(error);
                });
            }
        }
    };
};
exports.PaymentPlugin = PaymentPlugin;
//# sourceMappingURL=PaymentPlugin.js.map