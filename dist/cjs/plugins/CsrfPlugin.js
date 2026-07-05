"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CsrfPlugin = void 0;
const CsrfPlugin = () => {
    return {
        name: 'csrf',
        install: (_client) => {
            // CSRF logic is now natively integrated in HttpClient.innerRequest()
            // This plugin remains for backward compatibility but is no longer required.
        }
    };
};
exports.CsrfPlugin = CsrfPlugin;
//# sourceMappingURL=CsrfPlugin.js.map