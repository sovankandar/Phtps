import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../core/HttpClient';
import { EncryptionPlugin } from '../plugins/EncryptionPlugin';
import { RequestExecutor } from '../core/RequestExecuter';
import { SimpleCrypto } from '../utils/SimpleCrypto';
import { HttpClientConfig, HttpStreamResponse } from '../config/types';

describe('EncryptionPlugin', () => {
  let executeSpy: any;

  beforeEach(() => {
    executeSpy = vi.spyOn(RequestExecutor, 'execute');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('request body encrypted before sending when encryptionKey set', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const plainBody = { message: 'hello', secret: 42 };
    const key = 'secret-passphrase';

    let capturedConfig: HttpClientConfig | undefined;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedConfig = config;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'plain-response',
        config,
      };
    });

    await client.request({
      url: '/test-encrypt',
      method: 'POST',
      body: plainBody,
      encryptionKey: key,
    });

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?._isEncrypted).toBe(true);
    expect((capturedConfig?.headers as Headers).get('X-Phtps-Encrypted')).toBe('true');
    expect((capturedConfig?.headers as Headers).get('Content-Type')).toBe('application/json');

    // Body should be stringified encrypted structure
    const parsedBody = JSON.parse(capturedConfig?.body);
    expect(parsedBody.data).toBeDefined();
    expect(typeof parsedBody.data).toBe('string');

    // Decrypting the body with the key must yield the original payload exactly
    const decryptedBody = await SimpleCrypto.decrypt(parsedBody.data, key);
    expect(decryptedBody).toEqual(plainBody);
  });

  it('_isEncrypted=true prevents double-encrypt on the same request', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const initialBody = { message: 'pre-encrypted-already' };
    const key = 'secret-passphrase';

    let capturedConfig: HttpClientConfig | undefined;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedConfig = config;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    await client.request({
      url: '/test-prevent-double',
      method: 'POST',
      body: initialBody,
      encryptionKey: key,
      _isEncrypted: true,
    });

    expect(capturedConfig).toBeDefined();
    // Since _isEncrypted was set to true, request interceptor must bypass encryption.
    expect((capturedConfig?.headers as Headers).get('X-Phtps-Encrypted')).toBeNull();
    expect(capturedConfig?.body).toEqual(initialBody);
  });

  it('response with X-Phtps-Encrypted header is decrypted automatically', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const key = 'secure-key-abc';
    const plainResponseData = { confidential: 'data-package', value: [10, 20] };
    const encryptedResponseData = await SimpleCrypto.encrypt(plainResponseData, key);

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const headers = new Headers();
      headers.set('X-Phtps-Encrypted', 'true');
      return {
        status: 200,
        statusText: 'OK',
        headers,
        data: encryptedResponseData,
        config,
      };
    });

    const res = await client.request({
      url: '/test-decrypt',
      encryptionKey: key,
    });

    expect(res.data).toEqual(plainResponseData);
  });

  it('response with _isDecrypted=true is NOT decrypted again', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const key = 'secure-key-abc';
    const rawData = 'already-decrypted-as-plain-text';

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const headers = new Headers();
      headers.set('X-Phtps-Encrypted', 'true');
      return {
        status: 200,
        statusText: 'OK',
        headers,
        data: rawData,
        config,
      };
    });

    const res = await client.request({
      url: '/test-skip-decryption',
      encryptionKey: key,
      _isDecrypted: true,
    });

    // If it had decrypted again, it would have thrown since rawData is not encrypted base64 payload.
    expect(res.data).toBe(rawData);
  });

  it('encryptPayload=false skips encryption even when key present', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const body = { prop: 'plain' };
    const key = 'key';

    let capturedConfig: HttpClientConfig | undefined;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedConfig = config;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    await client.request({
      url: '/test-encrypt-disabled',
      method: 'POST',
      body,
      encryptionKey: key,
      encryptPayload: false,
    });

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig?._isEncrypted).toBeUndefined();
    expect((capturedConfig?.headers as Headers).get('X-Phtps-Encrypted')).toBeNull();
    expect(capturedConfig?.body).toEqual(body);
  });

  it('decryptResponse=false skips decryption even when header present', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const key = 'key';
    const rawEncrypted = 'some-unparsed-text';

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const headers = new Headers();
      headers.set('X-Phtps-Encrypted', 'true');
      return {
        status: 200,
        statusText: 'OK',
        headers,
        data: rawEncrypted,
        config,
      };
    });

    const res = await client.request({
      url: '/test-decrypt-disabled',
      encryptionKey: key,
      decryptResponse: false,
    });

    expect(res.data).toBe(rawEncrypted);
  });

  it('stream responses are not decrypted (cancel property check)', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const key = 'key';
    const fakeStreamData = {} as any;
    const cancelMock = vi.fn();

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      const headers = new Headers();
      headers.set('X-Phtps-Encrypted', 'true');

      const response: HttpStreamResponse = {
        status: 200,
        statusText: 'OK',
        headers,
        data: fakeStreamData,
        config,
        cancel: cancelMock,
      };
      return response;
    });

    const res = await client.request({
      url: '/test-stream',
      encryptionKey: key,
      stream: true,
    });

    expect(res.data).toBe(fakeStreamData);
    expect((res as any).cancel).toBe(cancelMock);
  });

  it('no encryptionKey: body sent as plain JSON', async () => {
    const client = new HttpClient();
    client.use(EncryptionPlugin());

    const body = { some: 'unencrypted-data' };
    let capturedConfig: HttpClientConfig | undefined;

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedConfig = config;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    await client.request({
      url: '/test-no-key',
      method: 'POST',
      body,
    });

    expect(capturedConfig).toBeDefined();
    capturedConfig = capturedConfig!;
    expect(capturedConfig?._isEncrypted).toBeUndefined();
    expect((capturedConfig?.headers as Headers).get('X-Phtps-Encrypted')).toBeNull();
    expect(capturedConfig?.body).toEqual(body);
  });
});
