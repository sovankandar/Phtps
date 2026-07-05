const keyCache = new Map<string, CryptoKey>();

export const SimpleCrypto = {
  getDerivedKey: async (secret: string, salt: Uint8Array): Promise<CryptoKey> => {
    const cacheKey = `${secret}:${salt.toString()}`;
    const cached = keyCache.get(cacheKey);
    if (cached) return cached;

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as any,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    
    keyCache.set(cacheKey, key);
    return key;
  },

  encrypt: async (data: any, secret: string): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await SimpleCrypto.getDerivedKey(secret, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

    const payload = new Uint8Array(salt.length + iv.length + cipher.byteLength);
    payload.set(salt, 0);
    payload.set(iv, salt.length);
    payload.set(new Uint8Array(cipher), salt.length + iv.length);

    // Safe base64 encode for UInt8Array
    let binary = '';
    for (let i = 0; i < payload.byteLength; i++) {
        binary += String.fromCharCode(payload[i]);
    }
    return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  },

  decrypt: async (base64: string, secret: string): Promise<any> => {
    let binary = '';
    if (typeof atob === 'function') {
        binary = atob(base64);
    } else {
        binary = Buffer.from(base64, 'base64').toString('binary');
    }
    
    const payload = new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
    
    // Structure: [SALT(16)] [IV(12)] [CIPHER]
    const salt = payload.slice(0, 16);
    const iv = payload.slice(16, 28);
    const cipher = payload.slice(28);
    
    const key = await SimpleCrypto.getDerivedKey(secret, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const str = new TextDecoder().decode(decrypted);
    return JSON.parse(str);
  }
};
