import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SimpleCrypto } from '../utils/SimpleCrypto';

describe('SimpleCrypto', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('encrypt then decrypt returns original data exactly', async () => {
    const secret = 'my-super-secret-key-123';
    const originalData = { hello: 'world', nested: { val: 42 } };

    const encrypted = await SimpleCrypto.encrypt(originalData, secret);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await SimpleCrypto.decrypt(encrypted, secret);
    expect(decrypted).toEqual(originalData);
  });

  it('two encrypt calls on same data produce different ciphertexts (random IV + salt)', async () => {
    const secret = 'my-secret-key';
    const data = 'same-string-every-time';

    const encrypted1 = await SimpleCrypto.encrypt(data, secret);
    const encrypted2 = await SimpleCrypto.encrypt(data, secret);

    expect(encrypted1).not.toBe(encrypted2);

    const decrypted1 = await SimpleCrypto.decrypt(encrypted1, secret);
    const decrypted2 = await SimpleCrypto.decrypt(encrypted2, secret);

    expect(decrypted1).toBe(data);
    expect(decrypted2).toBe(data);
  });

  it('decrypt with wrong key throws — does not silently return garbage', async () => {
    const secret1 = 'secret-one';
    const secret2 = 'secret-two';
    const data = { sensitive: 'information' };

    const encrypted = await SimpleCrypto.encrypt(data, secret1);

    await expect(SimpleCrypto.decrypt(encrypted, secret2)).rejects.toThrow();
  });

  it('decrypt with truncated ciphertext throws', async () => {
    const secret = 'my-secret';
    const data = 'some payload to encrypt';
    const encrypted = await SimpleCrypto.encrypt(data, secret);

    // Truncate the base64 string
    const truncated = encrypted.slice(0, Math.floor(encrypted.length / 2));

    await expect(SimpleCrypto.decrypt(truncated, secret)).rejects.toThrow();
  });

  it('encrypts nested objects, arrays, strings, numbers correctly', async () => {
    const secret = 'complex-secret';
    const testCases = [
      { a: [1, 2, 3], b: { c: 'hello' } },
      [1, 'two', { nested: true }],
      'just a string',
      42,
      true,
      null,
    ];

    for (const testCase of testCases) {
      const encrypted = await SimpleCrypto.encrypt(testCase, secret);
      const decrypted = await SimpleCrypto.decrypt(encrypted, secret);
      expect(decrypted).toEqual(testCase);
    }
  });

  it('key cache: getDerivedKey called once per unique (secret, salt) pair', async () => {
    const secret = 'cached-secret';
    
    // We can spy on crypto.subtle.deriveKey to verify caching works at the lowest level
    const deriveKeySpy = vi.spyOn(crypto.subtle, 'deriveKey');

    // Generating random salt
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 100]);

    // First call with salt
    await SimpleCrypto.getDerivedKey(secret, salt);
    expect(deriveKeySpy).toHaveBeenCalledTimes(1);

    // Second call with identical salt should be cached and not hit deriveKey again
    await SimpleCrypto.getDerivedKey(secret, salt);
    expect(deriveKeySpy).toHaveBeenCalledTimes(1);

    // Call with a different salt should derive again
    const salt2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 200]);
    await SimpleCrypto.getDerivedKey(secret, salt2);
    expect(deriveKeySpy).toHaveBeenCalledTimes(2);
  });

  it('works in Node.js (atob/btoa polyfill path) and browser (native path)', async () => {
    const secret = 'env-secret';
    const data = { msg: 'poly-test' };

    // 1. Native/Browser path (where globalThis.btoa and globalThis.atob are present)
    const originalBtoa = globalThis.btoa;
    const originalAtob = globalThis.atob;

    if (!originalBtoa || !originalAtob) {
      // If we are in environment without native atob/btoa (unlikely in Node 16+ or Vitest, but let's define them)
      globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
      globalThis.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
    }

    const encNative = await SimpleCrypto.encrypt(data, secret);
    const decNative = await SimpleCrypto.decrypt(encNative, secret);
    expect(decNative).toEqual(data);

    // 2. Node.js fallback path: temporarily delete atob and btoa or set them to undefined
    // We can also pretend atob and btoa are not functions in the local environment by mocking
    // But since SimpleCrypto checks: typeof btoa === 'function' ? ... : ...
    // and typeof atob === 'function' ? ... : ...
    // If they are on globalThis, typeof btoa reports 'function'. 
    // Let's modify the globals temporarily to be undefined
    const hasBtoa = 'btoa' in globalThis;
    const hasAtob = 'atob' in globalThis;
    const tempBtoa = (globalThis as any).btoa;
    const tempAtob = (globalThis as any).atob;

    try {
      if (hasBtoa) delete (globalThis as any).btoa;
      if (hasAtob) delete (globalThis as any).atob;

      const encFallback = await SimpleCrypto.encrypt(data, secret);
      const decFallback = await SimpleCrypto.decrypt(encFallback, secret);
      expect(decFallback).toEqual(data);
    } finally {
      if (hasBtoa) (globalThis as any).btoa = tempBtoa;
      if (hasAtob) (globalThis as any).atob = tempAtob;
    }
  });
});
