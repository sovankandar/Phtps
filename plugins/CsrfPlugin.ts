import { PhtpsPlugin } from '../config/types';

export const CsrfPlugin = (): PhtpsPlugin => {
  return {
    name: 'csrf',
    install: (_client) => {
      // CSRF logic is now natively integrated in HttpClient.innerRequest()
      // This plugin remains for backward compatibility but is no longer required.
    }
  };
};
