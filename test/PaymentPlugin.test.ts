import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient } from '../core/HttpClient';
import { PaymentPlugin } from '../plugins/PaymentPlugin';
import { RequestExecutor } from '../core/RequestExecuter';
import { HttpClientConfig, HttpError } from '../config/types';

const createHttpError = (message: string, status: number, config: HttpClientConfig): HttpError => {
  const err = new Error(message) as HttpError;
  err.config = config;
  err.response = {
    status,
    statusText: 'Payment Required',
    headers: new Headers(),
    data: null,
    config,
  };
  return err;
};

describe('PaymentPlugin', () => {
  let executeSpy: any;

  beforeEach(() => {
    executeSpy = vi.spyOn(RequestExecutor, 'execute');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Idempotency-Key header present and unique per request', async () => {
    const client = new HttpClient();
    client.use(PaymentPlugin({ idempotency: true }));

    const capturedHeaders: Headers[] = [];

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedHeaders.push(config.headers as Headers);
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    // Make first request
    await client.request({ url: '/pay-1', method: 'POST' });
    // Make second request
    await client.request({ url: '/pay-2', method: 'POST' });

    expect(capturedHeaders.length).toBe(2);

    const key1 = capturedHeaders[0].get('Idempotency-Key');
    const key2 = capturedHeaders[1].get('Idempotency-Key');

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toBeNull();
    expect(key2).not.toBeNull();
    expect(key1).not.toEqual(key2); // must be unique

    // Test with a custom string function
    const customClient = new HttpClient();
    customClient.use(PaymentPlugin({ idempotency: () => 'always-this-idempotency-key' }));

    let capturedCustomHeader: Headers | undefined;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedCustomHeader = config.headers as Headers;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    await customClient.request({ url: '/pay-custom', method: 'POST' });
    expect(capturedCustomHeader?.get('Idempotency-Key')).toBe('always-this-idempotency-key');

    // Test bypass using config.payment.idempotencyKey = false
    await customClient.request({
      url: '/pay-bypass',
      method: 'POST',
      payment: { idempotencyKey: false },
    });
    expect(capturedCustomHeader?.get('Idempotency-Key')).toBeNull();

    // Test explicit pay config idempotency key
    await customClient.request({
      url: '/pay-explicit',
      method: 'POST',
      payment: { idempotencyKey: 'explicit-123' },
    });
    expect(capturedCustomHeader?.get('Idempotency-Key')).toBe('explicit-123');
  });

  it('X-Timestamp header present, value is unix seconds string', async () => {
    const client = new HttpClient();
    client.use(PaymentPlugin({ timestamp: true }));

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

    const startTime = Math.floor(Date.now() / 1000);
    await client.request({ url: '/pay-time' });
    const endTime = Math.floor(Date.now() / 1000);

    expect(capturedConfig).toBeDefined();
    const tsHeaderValue = (capturedConfig?.headers as Headers).get('X-Timestamp');
    expect(tsHeaderValue).not.toBeNull();
    
    const parsedTs = parseInt(tsHeaderValue!, 10);
    expect(parsedTs).toBeGreaterThanOrEqual(startTime);
    expect(parsedTs).toBeLessThanOrEqual(endTime);
  });

  it('HMAC signature computed from timestamp.payload — verifiable', async () => {
    const client = new HttpClient();
    const secret = 'my-super-secret-key-123';
    client.use(PaymentPlugin({ signRequests: true, secretKey: secret }));

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

    const payload = { amount: 500, currency: 'USD' };
    await client.request({
      url: '/pay-secure',
      method: 'POST',
      body: payload,
    });

    expect(capturedConfig).toBeDefined();
    const headers = capturedConfig?.headers as Headers;
    const timestamp = headers.get('X-Timestamp');
    const signature = headers.get('X-Signature');

    expect(timestamp).not.toBeNull();
    expect(signature).not.toBeNull();

    // Recompute signature manually with Web Crypto to verify matching AWS-style HMAC SHA-256
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const payloadStr = JSON.stringify(payload);
    const dataToSign = `${timestamp}.${payloadStr}`;
    const rawSig = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
    const recomputedSignature = Array.from(new Uint8Array(rawSig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    expect(signature).toBe(recomputedSignature);
  });

  it('rate limit exceeded: throws before request fires', async () => {
    const client = new HttpClient();
    client.use(
      PaymentPlugin({
        rateLimit: {
          maxRequests: 2,
          windowMs: 5000,
        },
      })
    );

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    // 1st request should succeed
    const res1 = await client.request({ url: '/pay-rate-1' });
    expect(res1.data).toBe('ok');

    // 2nd request should succeed
    const res2 = await client.request({ url: '/pay-rate-2' });
    expect(res2.data).toBe('ok');

    // 3rd request inside window should fail fast and throw Rate limit exceeded before RequestExecutor is called
    await expect(client.request({ url: '/pay-rate-3' })).rejects.toThrow(
      '[PaymentPlugin] SECURITY BLOCK: Rate limit exceeded'
    );

    expect(executeSpy).toHaveBeenCalledTimes(2);

    // Skip rate limit by setting skipRateLimit: true
    const resBypass = await client.request({
      url: '/pay-rate-4',
      payment: { skipRateLimit: true },
    });
    expect(resBypass.data).toBe('ok');
    expect(executeSpy).toHaveBeenCalledTimes(3);
  });

  it('CVV, cardNumber, token scrubbed from error.config.body on failure', async () => {
    const client = new HttpClient();
    client.use(PaymentPlugin({ maskSensitiveData: true }));

    const bodyWithSensitiveInfo = {
      amount: 1000,
      cardNumber: '1234-5678-9012-3456',
      cvv: '123',
      token: 'tok_visa123456_secret_data',
      beneficiary: {
        name: 'John Doe',
        cvc: '999',
      },
    };

    const inputConfig: HttpClientConfig = {
      url: '/unsafe-post',
      method: 'POST',
      body: JSON.stringify(bodyWithSensitiveInfo),
    };

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      throw createHttpError('Card Declined', 402, config);
    });

    try {
      await client.request(inputConfig);
      // Fail test if request didn't throw
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toBe('Card Declined');
      expect(err.config).toBeDefined();
      expect(err.config.body).toBeDefined();

      const parsedScrubbedBody = JSON.parse(err.config.body);
      expect(parsedScrubbedBody.amount).toBe(1000);
      expect(parsedScrubbedBody.cardNumber).toBe('***MASKED***');
      expect(parsedScrubbedBody.cvv).toBe('***MASKED***');
      expect(parsedScrubbedBody.token).toBe('***MASKED***');
      expect(parsedScrubbedBody.beneficiary.name).toBe('John Doe');
      expect(parsedScrubbedBody.beneficiary.cvc).toBe('***MASKED***');
    }
  });

  it('returns { ...config, headers } — does not mutate original config', async () => {
    const client = new HttpClient();
    client.use(PaymentPlugin({ environment: 'sandbox' }));

    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    const originalHeaders = new Headers();
    originalHeaders.set('X-Custom-Req', 'custom-value');

    const originalConfig: HttpClientConfig = {
      url: '/test-mutate',
      headers: originalHeaders,
    };

    const res = await client.request(originalConfig);

    // Verify original object reference is different (shallow clone of config is returned or used)
    expect(res.config).not.toBe(originalConfig);

    // Verify original headers doesn't contain the payment headers injected like X-Environment or X-Timestamp
    expect(originalHeaders.has('X-Environment')).toBe(false);
    expect(originalHeaders.has('X-Timestamp')).toBe(false);

    // Passed header is preserved on the sent config
    const sentHeaders = res.config.headers as Headers;
    expect(sentHeaders.get('X-Custom-Req')).toBe('custom-value');
    expect(sentHeaders.get('X-Environment')).toBe('sandbox');
    expect(sentHeaders.get('X-Timestamp')).toBeDefined();
  });

  it("environment=sandbox: X-Environment header is 'sandbox'", async () => {
    const client = new HttpClient();
    client.use(PaymentPlugin({ environment: 'sandbox' }));

    let capturedHeaders: Headers | undefined;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedHeaders = config.headers as Headers;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    await client.request({ url: '/sandbox-env' });

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders?.get('X-Environment')).toBe('sandbox');
  });

  it('customSigner: receives payload and timestamp, result used as signature', async () => {
    const client = new HttpClient();
    const customSignerFn = vi.fn().mockImplementation((payload, timestamp) => {
      return `custom-sig-${timestamp}-${payload}`;
    });

    client.use(
      PaymentPlugin({
        signRequests: true,
        customSigner: customSignerFn,
      })
    );

    let capturedHeaders: Headers | undefined;
    executeSpy.mockImplementation(async (config: HttpClientConfig) => {
      capturedHeaders = config.headers as Headers;
      return {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        data: 'ok',
        config,
      };
    });

    const bodyObj = { action: 'purchase' };
    await client.request({
      url: '/custom-signer-endpoint',
      method: 'POST',
      body: bodyObj,
    });

    expect(capturedHeaders).toBeDefined();
    const timestamp = capturedHeaders?.get('X-Timestamp');
    const signature = capturedHeaders?.get('X-Signature');

    expect(timestamp).not.toBeNull();
    expect(customSignerFn).toHaveBeenCalled();
    expect(customSignerFn).toHaveBeenCalledWith(JSON.stringify(bodyObj), timestamp);
    expect(signature).toBe(`custom-sig-${timestamp}-${JSON.stringify(bodyObj)}`);
  });
});
