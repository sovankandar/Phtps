import { PhtpsPlugin } from '../config/types';
export interface RateLimitStore {
    /**
     * Checks if a request should be allowed.
     * Should throw an error if the rate limit is exceeded.
     * @param key A unique key for the rate limit (e.g. plugin name or specific endpoint)
     * @param max Max requests allowed in the window
     * @param windowMs Time window in milliseconds
     */
    check(key: string, max: number, windowMs: number): Promise<void> | void;
}
export interface PaymentPluginOptions {
    /** Enables sandbox or production logic (e.g. injects X-Environment) */
    environment?: 'sandbox' | 'production';
    /** Secret key for request payload signing (HMAC SHA-256) */
    secretKey?: string;
    /** Whether to automatically sign requests. Defaults to false. */
    signRequests?: boolean;
    /** Whether to inject Idempotency-Key headers. Defaults to true. */
    idempotency?: boolean | (() => string);
    /** Whether to inject X-Timestamp header to prevent MITM replays. Defaults to true. */
    timestamp?: boolean;
    /**
     * Automatically throttle/DOS-protect outgoing payment API requests.
     * NOTE: By default, this uses an in-memory store that is per-process.
     * In a horizontally scaled environment (multiple Node instances), use a custom `store`.
     */
    rateLimit?: {
        maxRequests: number;
        windowMs: number;
        /** Custom storage for shared rate limiting (e.g. Redis, Upstash) */
        store?: RateLimitStore;
    };
    /** Deeply strips CVV, card numbers, and tokens from thrown Request errors. */
    maskSensitiveData?: boolean;
    /** Custom function to generate signatures, bypassing the built-in Web Crypto HMAC SHA-256 */
    customSigner?: (payload: string, timestamp: string) => Promise<string> | string;
}
/**
 * Highly secure, zero-trust Payment Plugin targeting API protections,
 * Idempotency, HMAC Request signing, and throttling.
 */
export declare const PaymentPlugin: (options?: PaymentPluginOptions) => PhtpsPlugin;
//# sourceMappingURL=PaymentPlugin.d.ts.map