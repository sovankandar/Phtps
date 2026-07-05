export declare const SimpleCrypto: {
    getDerivedKey: (secret: string, salt: Uint8Array) => Promise<CryptoKey>;
    encrypt: (data: any, secret: string) => Promise<string>;
    decrypt: (base64: string, secret: string) => Promise<any>;
};
//# sourceMappingURL=SimpleCrypto.d.ts.map