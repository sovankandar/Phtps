"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionPlugin = void 0;
const SimpleCrypto_1 = require("../utils/SimpleCrypto");
/**
 * Robust encryption plugin for Phtps.
 * Provides automatic payload encryption and response decryption using Web Crypto API.
 */
const EncryptionPlugin = () => {
    return {
        name: 'encryption',
        install: (client) => {
            // 1. Request Interceptor: Auto Encrypt payload if key exists
            client.interceptors.request.use(async (config) => {
                if (config.encryptionKey && config.body && config.encryptPayload !== false && !config._isEncrypted) {
                    const encryptedBody = await SimpleCrypto_1.SimpleCrypto.encrypt(config.body, config.encryptionKey);
                    const headers = new Headers(config.headers || {});
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
            client.interceptors.response.use(async (response) => {
                const isEncrypted = response.headers?.get('X-Phtps-Encrypted') === 'true';
                if (response.config.encryptionKey &&
                    isEncrypted &&
                    response.config.decryptResponse !== false &&
                    !response.config._isDecrypted) {
                    if (!('cancel' in response)) { // Prevent streaming decrypt for now
                        const ciphertext = response.data?.data ?? response.data;
                        const decrypted = await SimpleCrypto_1.SimpleCrypto.decrypt(ciphertext, response.config.encryptionKey);
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
exports.EncryptionPlugin = EncryptionPlugin;
//# sourceMappingURL=EncryptionPlugin.js.map