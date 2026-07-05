import { CsrfConfig, HttpClientConfig } from '../config/types';

export class CsrfManager {
  private static defaultMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  private static defaultCookieName = 'XSRF-TOKEN';
  private static defaultHeaderName = 'X-XSRF-TOKEN';

  public static async attach(config: HttpClientConfig): Promise<HttpClientConfig> {
    const csrf = config.csrf;
    if (!csrf) return config;

    const csrfConfig = typeof csrf === 'boolean' 
      ? { enabled: csrf } 
      : { ...csrf };

    if (csrfConfig.enabled === false) return config;

    const method = (config.method || 'GET').toUpperCase();
    const targetMethods = csrfConfig.methods || this.defaultMethods;

    if (!targetMethods.includes(method)) return config;

    // Same-origin check
    const isSameOrigin = this.isSameOrigin(config.url || '', csrfConfig.originWhitelist);
    if (!isSameOrigin) {
      if (csrfConfig.strict) {
        throw new Error(`[Eping] CSRF protection blocked cross-origin request to ${config.url}. Add this origin to 'originWhitelist' if intended.`);
      }
      return config;
    }

    let token = await this.resolveToken(csrfConfig);

    // Recovery Option: onTokenMissing
    if (!token && csrfConfig.onTokenMissing) {
      console.log('[Eping] CSRF token missing. Attempting recovery via onTokenMissing...');
      token = await csrfConfig.onTokenMissing() || undefined;
    }

    if (!token) {
      const message = `[Eping] CSRF SECURITY ALERT: Protected ${method} request to ${config.url} is missing an anti-forgery token.`;
      const resolution = csrfConfig.cookieName 
        ? `Ensure cookie '${csrfConfig.cookieName}' is present.` 
        : 'Ensure a custom token resolver or storageKey is provided.';

      if (csrfConfig.strict) {
        throw new Error(`${message} ${resolution} (Strict mode enabled)`);
      } else {
        console.warn(`${message} ${resolution}`);
      }
      return config;
    }

    // Attach to headers
    const headerName = csrfConfig.headerName || this.defaultHeaderName;
    const newHeaders = new Headers(config.headers as HeadersInit);
    newHeaders.set(headerName, token);

    return {
      ...config,
      headers: newHeaders
    };
  }

  private static async resolveToken(config: CsrfConfig): Promise<string | undefined> {
    // 1. Explicit token
    if (typeof config.token === 'string') return config.token;

    // 2. Custom Resolver
    if (typeof config.token === 'function') {
      return await config.token();
    }

    // 3. Cookie (Browser only)
    if (typeof document !== 'undefined') {
      const cookieName = config.cookieName || this.defaultCookieName;
      const cookieValue = this.getCookie(cookieName);
      if (cookieValue) return cookieValue;
    }

    // 4. LocalStorage
    if (typeof localStorage !== 'undefined' && config.storageKey) {
      return localStorage.getItem(config.storageKey) || undefined;
    }

    return undefined;
  }

  private static getCookie(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
    return undefined;
  }

  private static isSameOrigin(url: string, whitelist?: string[]): boolean {
    if (typeof window === 'undefined') return true; // Server context, assume trust or handle differently
    
    // Relative URLs are same origin
    if (!url.startsWith('http')) return true;

    try {
      const target = new URL(url);
      const current = new URL(window.location.href);

      if (target.origin === current.origin) return true;
      if (whitelist && whitelist.includes(target.origin)) return true;

      return false;
    } catch {
      return false;
    }
  }
}
