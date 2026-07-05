import { UrlBuilder } from './UrlBuilder';
import { SimpleCrypto } from '../utils/SimpleCrypto';
import { StreamReader } from './StreamReader';
export class RequestExecutor {
    static async execute(config) {
        const safeConfig = { ...config };
        delete safeConfig.encryptionKey;
        if (config.signal?.aborted) {
            const error = new Error('Request cancelled');
            error.isCancel = true;
            error.config = safeConfig;
            throw error;
        }
        const { timeout, encryptionKey, encryptPayload, decryptResponse, headers, body, signal, _fullUrl, onUploadProgress, onDownloadProgress } = config;
        const fullUrl = _fullUrl || UrlBuilder.build(config);
        // Use XHR for upload progress as fetch doesn't support it reliably yet
        if (onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
            return this.executeWithXHR(fullUrl, config);
        }
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        let isTimeout = false;
        let timeoutId = null;
        try {
            if (signal) {
                signal.addEventListener('abort', onAbort);
                if (signal.aborted)
                    controller.abort();
            }
            if (timeout) {
                timeoutId = setTimeout(() => {
                    isTimeout = true;
                    controller.abort();
                }, timeout);
            }
            let finalBody = body;
            let finalHeaders = new Headers(headers);
            const activeEncryptionKey = encryptionKey;
            const alreadyEncrypted = config._isEncrypted;
            if (encryptPayload && body && !alreadyEncrypted) {
                if (!activeEncryptionKey) {
                    throw new Error('[Phtps] Encryption enabled but no encryptionKey provided. For security, keys must be passed explicitly and not via environment variables.');
                }
                const encrypted = await SimpleCrypto.encrypt(body, activeEncryptionKey);
                finalBody = JSON.stringify({ data: encrypted });
                finalHeaders.set('Content-Type', 'application/json');
                finalHeaders.set('X-Phtps-Encrypted', 'true');
            }
            else if (body && typeof body === 'object') {
                finalBody = JSON.stringify(body);
                if (!finalHeaders.has('Content-Type')) {
                    finalHeaders.set('Content-Type', 'application/json');
                }
            }
            const response = await fetch(fullUrl, {
                method: config.method || 'GET',
                body: finalBody,
                headers: finalHeaders,
                signal: controller.signal,
            });
            if (config.stream) {
                if (!response.body) {
                    throw new Error('[Phtps] Response body is null, cannot stream.');
                }
                const streamResponse = {
                    data: StreamReader.transform(response, config),
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    config: safeConfig,
                    cancel: () => controller.abort(),
                };
                if (!response.ok) {
                    const error = new Error(`HTTP Error: ${response.status}`);
                    error.response = streamResponse;
                    error.config = safeConfig;
                    throw error;
                }
                return streamResponse;
            }
            if (!response.ok) {
                const responseData = await this.parseResponse(response);
                const error = new Error(`HTTP Error: ${response.status}`);
                error.response = {
                    data: responseData,
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                    config: safeConfig,
                };
                error.config = safeConfig;
                throw error;
            }
            let responseData;
            if (onDownloadProgress && response.body) {
                responseData = await this.readWithProgress(response, onDownloadProgress);
            }
            else {
                responseData = await this.parseResponse(response);
            }
            if (decryptResponse && response.headers.get('X-Phtps-Encrypted') === 'true') {
                if (!activeEncryptionKey) {
                    throw new Error('[Phtps] Decryption enabled but no encryptionKey provided.');
                }
                if (responseData && responseData.data) {
                    responseData = await SimpleCrypto.decrypt(responseData.data, activeEncryptionKey);
                }
                else if (typeof responseData === 'string') {
                    responseData = await SimpleCrypto.decrypt(responseData, activeEncryptionKey);
                }
                safeConfig._isDecrypted = true;
            }
            const httpResponse = {
                data: responseData,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                config: safeConfig,
            };
            return httpResponse;
        }
        catch (error) {
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                if (isTimeout) {
                    errorMessage = `Request timed out after ${timeout}ms`;
                    console.error(`[HttpClient] ${errorMessage} for ${fullUrl}`);
                }
                else {
                    errorMessage = 'Request cancelled';
                    console.log(`[HttpClient] ${errorMessage} for ${fullUrl}`);
                }
            }
            const httpError = error instanceof Error ? error : new Error(errorMessage);
            if (errorMessage !== error.message) {
                httpError.message = errorMessage;
            }
            httpError.isCancel = error.name === 'AbortError' && !isTimeout;
            httpError.isTimeout = isTimeout;
            httpError.config = safeConfig;
            // Ensure response is preserved if it was already set on the original error
            if (error.response && !httpError.response) {
                httpError.response = error.response;
            }
            throw httpError;
        }
        finally {
            if (timeoutId)
                clearTimeout(timeoutId);
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
        }
    }
    static async parseResponse(response) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        return response.text();
    }
    static async readWithProgress(response, onProgress) {
        const reader = response.body.getReader();
        const contentLength = +(response.headers.get('Content-Length') || 0);
        let loaded = 0;
        const chunks = [];
        const startTime = Date.now();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            chunks.push(value);
            loaded += value.length;
            const currentTime = Date.now();
            const duration = (currentTime - startTime) / 1000;
            const rate = duration > 0 ? loaded / duration : 0;
            onProgress({
                loaded,
                total: contentLength || loaded, // Fallback if no content-length
                progress: contentLength ? loaded / contentLength : 0,
                bytes: loaded,
                rate
            });
        }
        const allChunks = new Uint8Array(loaded);
        let position = 0;
        for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return JSON.parse(new TextDecoder().decode(allChunks));
        }
        return new TextDecoder().decode(allChunks);
    }
    static async executeWithXHR(url, config) {
        const safeConfig = { ...config };
        delete safeConfig.encryptionKey;
        const { method = 'GET', timeout, headers, body, onUploadProgress, onDownloadProgress, encryptionKey, encryptPayload, signal } = config;
        let finalHeaders = new Headers(headers);
        let finalBody = body;
        const alreadyEncrypted = config._isEncrypted;
        if (encryptPayload && body && encryptionKey && !alreadyEncrypted) {
            const encrypted = await SimpleCrypto.encrypt(body, encryptionKey);
            finalBody = JSON.stringify({ data: encrypted });
            finalHeaders.set('Content-Type', 'application/json');
            finalHeaders.set('X-Phtps-Encrypted', 'true');
        }
        else if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
            finalBody = JSON.stringify(body);
            if (!finalHeaders.has('Content-Type')) {
                finalHeaders.set('Content-Type', 'application/json');
            }
        }
        return new Promise((resolve, reject) => {
            if (signal && signal.aborted) {
                const error = new Error('Request cancelled');
                error.isCancel = true;
                error.config = safeConfig;
                return reject(error);
            }
            const xhr = new XMLHttpRequest();
            const startTime = Date.now();
            const onAbort = () => xhr.abort();
            const cleanup = () => {
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
            };
            xhr.open(method, url, true);
            xhr.timeout = timeout || 0;
            finalHeaders.forEach((value, key) => {
                xhr.setRequestHeader(key, value);
            });
            if (signal) {
                signal.addEventListener('abort', onAbort);
                if (signal.aborted) {
                    onAbort();
                }
            }
            if (onUploadProgress && xhr.upload) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const currentTime = Date.now();
                        const duration = (currentTime - startTime) / 1000;
                        const rate = duration > 0 ? e.loaded / duration : 0;
                        onUploadProgress({
                            loaded: e.loaded,
                            total: e.total,
                            progress: e.loaded / e.total,
                            bytes: e.loaded,
                            rate
                        });
                    }
                };
            }
            if (onDownloadProgress) {
                xhr.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const currentTime = Date.now();
                        const duration = (currentTime - startTime) / 1000;
                        const rate = duration > 0 ? e.loaded / duration : 0;
                        onDownloadProgress({
                            loaded: e.loaded,
                            total: e.total,
                            progress: e.loaded / e.total,
                            bytes: e.loaded,
                            rate
                        });
                    }
                };
            }
            xhr.onabort = () => {
                cleanup();
                const error = new Error('Request cancelled');
                error.isCancel = true;
                error.config = safeConfig;
                reject(error);
            };
            xhr.onload = async () => {
                try {
                    const responseHeaders = new Headers();
                    xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((line) => {
                        const parts = line.split(': ');
                        const key = parts.shift();
                        const value = parts.join(': ');
                        if (key)
                            responseHeaders.set(key, value);
                    });
                    let responseData = xhr.response;
                    try {
                        if (responseHeaders.get('content-type')?.includes('application/json')) {
                            responseData = JSON.parse(xhr.responseText);
                        }
                        else {
                            responseData = xhr.responseText;
                        }
                    }
                    catch {
                        responseData = xhr.responseText;
                    }
                    cleanup();
                    if (config.decryptResponse && responseHeaders.get('X-Phtps-Encrypted') === 'true') {
                        const activeEncryptionKey = config.encryptionKey;
                        if (!activeEncryptionKey) {
                            reject(new Error('[Phtps] Decryption enabled but no encryptionKey provided.'));
                            return;
                        }
                        try {
                            if (responseData && responseData.data) {
                                responseData = await SimpleCrypto.decrypt(responseData.data, activeEncryptionKey);
                            }
                            else if (typeof responseData === 'string') {
                                responseData = await SimpleCrypto.decrypt(responseData, activeEncryptionKey);
                            }
                            safeConfig._isDecrypted = true;
                        }
                        catch (decryptionError) {
                            reject(decryptionError);
                            return;
                        }
                    }
                    const httpResponse = {
                        data: responseData,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        headers: responseHeaders,
                        config: safeConfig
                    };
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(httpResponse);
                    }
                    else {
                        const error = new Error(`HTTP Error: ${xhr.status}`);
                        error.response = httpResponse;
                        error.config = safeConfig;
                        reject(error);
                    }
                }
                catch (e) {
                    cleanup();
                    reject(e);
                }
            };
            xhr.onerror = () => {
                cleanup();
                const error = new Error('Network Error');
                error.config = safeConfig;
                reject(error);
            };
            xhr.ontimeout = () => {
                cleanup();
                const error = new Error(`Request timed out after ${timeout}ms`);
                error.isTimeout = true;
                error.config = safeConfig;
                reject(error);
            };
            xhr.send(finalBody);
        });
    }
}
//# sourceMappingURL=RequestExecuter.js.map