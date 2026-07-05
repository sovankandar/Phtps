import { IHttpClient, PhtpsPlugin, HttpClientConfig, HttpResponse, HttpStreamResponse } from '../config/types';
import { SimpleCrypto } from '../utils/SimpleCrypto';

/**
 * Robust encryption plugin for Phtps.
 * Provides automatic payload encryption and response decryption using Web Crypto API.
 */
export const EncryptionPlugin = (): PhtpsPlugin => {
  return {
    name: 'encryption',
    install: (client: IHttpClient) => {
      // 1. Request Interceptor: Auto Encrypt payload if key exists
      client.interceptors.request.use(async (config: HttpClientConfig) => {
        if (config.encryptionKey && config.body && config.encryptPayload !== false && !config._isEncrypted) {
          const encryptedBody = await SimpleCrypto.encrypt(config.body, config.encryptionKey);
          const headers = new Headers(config.headers as HeadersInit || {});
          headers.set('X-Phtps-Encrypted', 'true');
          headers.set('Content-Type', 'application/json');
          
          return {
            ...config,
            body: JSON.stringify({ data: encryptedBody }),
            headers,
            _isEncrypted: true
          };
        }
        return config;
      });

      // 2. Response Interceptor: Auto Decrypt payload if response is encrypted
      client.interceptors.response.use(async (response: HttpResponse | HttpStreamResponse) => {
        const isEncrypted = response.headers?.get('X-Phtps-Encrypted') === 'true';
        
        if (
          response.config.encryptionKey && 
          isEncrypted && 
          response.config.decryptResponse !== false &&
          !response.config._isDecrypted
        ) {
          if (!('cancel' in response)) { // Prevent streaming decrypt for now
            const ciphertext = response.data?.data ?? response.data;
            const decrypted = await SimpleCrypto.decrypt(ciphertext, response.config.encryptionKey);
            return {
              ...response,
              data: decrypted
            };
          }
        }
        return response;
      });
    }
  };
};
