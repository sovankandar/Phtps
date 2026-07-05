import { describe, it, expect } from 'vitest';
import { UrlBuilder } from '../core/UrlBuilder';

describe('UrlBuilder', () => {
  it('builds correct URL from baseURL + relative path', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'users',
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users');
  });

  it('does not double-slash when baseURL has trailing slash + path has leading slash', () => {
    const config = {
      baseURL: 'https://api.example.com/',
      url: '/users',
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users');
  });

  it('appends params as query string, skips null and undefined values', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'users',
      params: {
        active: true,
        role: 'admin',
        cursor: null as any,
        page: undefined as any,
        limit: 10,
      },
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users?active=true&role=admin&limit=10');
  });

  it('preserves existing query string when params also provided', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'users?type=all',
      params: {
        limit: 10,
      },
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users?type=all&limit=10');
  });

  it('returns absolute URL unchanged when url starts with http(s)://', () => {
    const config1 = {
      baseURL: 'https://api.example.com',
      url: 'https://external.com/api',
    };
    const config2 = {
      baseURL: 'https://api.example.com',
      url: 'http://external.com/api',
    };
    expect(UrlBuilder.build(config1)).toBe('https://external.com/api');
    expect(UrlBuilder.build(config2)).toBe('http://external.com/api');
  });

  it('handles empty params object — no trailing ?', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'users',
      params: {},
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users');
  });

  it('encodes special chars in param values (&, =, space)', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'search',
      params: {
        q: 'john & doe = admin',
      },
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/search?q=john+%26+doe+%3D+admin');
  });

  it('handles missing/undefined baseURL and relative url', () => {
    const config = {
      url: 'users',
    };
    expect(UrlBuilder.build(config)).toBe('users');
  });

  it('handles missing/undefined baseURL and relative url starting with slash', () => {
    const config = {
      url: '/users',
    };
    expect(UrlBuilder.build(config)).toBe('/users');
  });

  it('handles empty/undefined config, returning fallback root slash', () => {
    expect(UrlBuilder.build({})).toBe('/');
  });

  it('handles params with only null or undefined values — no trailing ? and empty query string', () => {
    const config = {
      baseURL: 'https://api.example.com',
      url: 'users',
      params: {
        page: undefined as any,
        cursor: null as any,
      },
    };
    expect(UrlBuilder.build(config)).toBe('https://api.example.com/users');
  });
});
