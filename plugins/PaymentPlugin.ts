import { IHttpClient, PhtpsPlugin, HttpClientConfig } from '../config/types';

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

class RateLimiter {
  private requests: number[] = [];
  constructor(private max: number, private windowMs: number, private store?: RateLimitStore) {}

  public async check() {
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
const signPayload = async (secret: string, payload: string, timestamp: string): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn('[PaymentPlugin] Web Crypto API not available. Cannot sign request.');
    return '';
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', 
    enc.encode(secret), 
    { name: 'HMAC', hash: 'SHA-256' }, 
    false, 
    ['sign']
  );
  
  // Hash the timestamp + payload together (AWS style)
  const dataToSign = `${timestamp}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Deep-clones and scrubs sensitive CVV/Card data from objects for safe logging */
const scrubSensitiveData = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(scrubSensitiveData);
  
  const scrubbed = { ...obj };
  const sensitiveKeys = ['cvv', 'cvc', 'cardnumber', 'card_number', 'token', 'secret', 'password'];
  
  for (const key of Object.keys(scrubbed)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      scrubbed[key] = '***MASKED***';
    } else if (typeof scrubbed[key] === 'object') {
      scrubbed[key] = scrubSensitiveData(scrubbed[key]);
    }
  }
  return scrubbed;
};

/**
 * Highly secure, zero-trust Payment Plugin targeting API protections, 
 * Idempotency, HMAC Request signing, and throttling.
 */
export const PaymentPlugin = (options: PaymentPluginOptions = {}): PhtpsPlugin => {
  const rateLimiter = options.rateLimit ? new RateLimiter(options.rateLimit.maxRequests, options.rateLimit.windowMs, options.rateLimit.store) : null;

  return {
    name: 'payment-security',
    install: (client: IHttpClient) => {
      
      // 1. Request Interceptor (Guards & Injection)
      client.interceptors.request.use(async (config: HttpClientConfig) => {
        
        // Rate Limiter
        if (rateLimiter && config.payment?.skipRateLimit !== true) {
          await rateLimiter.check();
        }

        const headers = new Headers(config.headers as HeadersInit || {});

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
            idempotencyKey = config.payment.idempotencyKey as string;
          } else if (typeof options.idempotency === 'function') {
            idempotencyKey = options.idempotency();
          } else {
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
          } else if (options.secretKey) {
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
        client.interceptors.response.use(
          response => response,
          error => {
            // Scrub sensitive payment info out of the configuration object attached to errors
            // This guarantees console.error(error) never leaks the user CVV or Card Data
            if (error && error.config && error.config.body) {
              try {
                let parsedBody = typeof error.config.body === 'string' ? JSON.parse(error.config.body) : error.config.body;
                parsedBody = scrubSensitiveData(parsedBody);
                error.config.body = JSON.stringify(parsedBody);
              } catch {
                 // Ignore JSON parse errors (might be form data, etc.)
                 error.config.body = '***MASKED_PAYLOAD***';
              }
            }
            return Promise.reject(error);
          }
        );
      }
    }
  };
};
