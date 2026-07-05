export const CsrfPlugin = () => {
    return {
        name: 'csrf',
        install: (_client) => {
            // CSRF logic is now natively integrated in HttpClient.innerRequest()
            // This plugin remains for backward compatibility but is no longer required.
        }
    };
};
//# sourceMappingURL=CsrfPlugin.js.map