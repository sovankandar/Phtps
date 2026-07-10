# Phtps

**A modern HTTP client built on native fetch.**  
Plugins for retry, auth, cache, deduplication, queue, encryption, streaming (SSE + NDJSON), pagination, and payment security. Zero dependencies. Full TypeScript.

```bash
npm install @pings/phtps
```

---

## Why Phtps

Most HTTP clients give you a thin wrapper around fetch and leave the hard parts to you. Phtps ships the features that production apps actually need — without pulling in extra dependencies.

| Feature | Phtps | Axios | Ky | Got |
|---|---|---|---|---|
| Retry with backoff | ✅ built-in | ❌ plugin needed | ⚠️ basic | ✅ |
| Token refresh (401 queue) | ✅ | ❌ manual | ❌ manual | ❌ manual |
| Proactive token rotation | ✅ | ❌ | ❌ | ❌ |
| Request deduplication | ✅ | ❌ | ❌ | ❌ |
| Response cache + adapters | ✅ | ❌ | ❌ | ❌ |
| Concurrency queue | ✅ | ❌ | ❌ | ❌ |
| SSE streaming | ✅ | ❌ | ❌ | ❌ |
| NDJSON streaming | ✅ | ❌ | ❌ | ❌ |
| Payload encryption (AES-GCM) | ✅ | ❌ | ❌ | ❌ |
| Payment security (HMAC) | ✅ | ❌ | ❌ | ❌ |
| CSRF protection | ✅ full | ⚠️ basic | ❌ | ❌ |
| Pagination (all strategies) | ✅ | ❌ | ❌ | ❌ |
| Plugin system | ✅ typed | ❌ | ⚠️ hooks | ❌ |
| Zero dependencies | ✅ | ❌ | ✅ | ❌ |
| Full TypeScript | ✅ | ✅ | ✅ | ✅ |

---

## Quick Start

```ts
import { Phtps } from 'phtps';

const { data } = await Phtps.get('/api/users');
const { data } = await Phtps.post('/api/users', { name: 'Alice' });
```

## Custom Instance

```ts
import { createHttpClient } from 'phtps';
import { RetryPlugin, AuthPlugin, CachePlugin } from 'phtps/plugins';

const api = createHttpClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
});

api.use([
  RetryPlugin(),
  AuthPlugin(),
  CachePlugin(),
]);

export default api;
```

---

## Plugins

Install only what you need. Every plugin is tree-shakeable.

```ts
import {
  RetryPlugin,
  AuthPlugin,
  CachePlugin,
  DedupePlugin,
  QueuePlugin,
  EncryptionPlugin,
  CsrfPlugin,
  PaginationPlugin,
  PaymentPlugin,
} from 'phtps/plugins';
```

### RetryPlugin

```ts
api.use(RetryPlugin());

await api.get('/api/data', {
  retries: 3,
  retryDelay: 1000, // exponential: 1s, 2s, 4s ± jitter
});
```

### AuthPlugin — token refresh on 401

```ts
api.use(AuthPlugin());

await api.get('/api/me', {
  onTokenRefresh: async () => {
    const { token } = await refreshToken();
    return token;
  },
});
```

### CachePlugin

```ts
api.use(CachePlugin());

await api.get('/api/users', { useCache: true, cacheTTL: 60000 });
```

### SSE Streaming

```ts
const stream = await api.stream('/api/chat', {
  method: 'POST',
  body: { messages },
  streamType: 'sse',
});

const reader = stream.data.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value.data); // parsed per-event
}
stream.cancel();
```

### PaginationPlugin — fetch all pages

```ts
api.use(PaginationPlugin());

const { data } = await api.get('/api/posts', {
  paginate: { strategy: 'cursor', cursorField: 'nextCursor', limit: 200 },
});
// data is all items merged across all pages
```

### PaymentPlugin — HMAC signing + idempotency

```ts
api.use(PaymentPlugin({
  secretKey: getRuntimeKey(),
  signRequests: true,
  idempotency: true,
  maskSensitiveData: true,
}));
```

---

## Error Handling

```ts
try {
  await api.get('/api/users');
} catch (err) {
  if (err.isTimeout) { /* timed out */ }
  if (err.isCancel)  { /* aborted */ }
  if (err.response)  {
    console.log(err.response.status);
    console.log(err.response.data);
  }
}
```

---

## TypeScript

```ts
import type { HttpClientConfig, HttpResponse, HttpError, PhtpsPlugin } from 'phtps';

const { data } = await api.get<User[]>('/api/users');
//      ^ User[]
```

---

## Requirements

- **Browser:** Any modern browser (Chrome 89+, Firefox 90+, Safari 15+)
- **Node.js:** 18.0.0 or later
- **Dependencies:** None

---

## Documentation

Full documentation: **[https://phtps.dev/docs](https://phtps.dev/docs)**

- [Config reference](https://phtps.dev/docs/config)
- [Plugins](https://phtps.dev/docs/plugins)
- [Streaming guide](https://phtps.dev/docs/streaming)
- [Writing a plugin](https://phtps.dev/docs/custom-plugin)
- [Migration from Axios](https://phtps.dev/docs/migration)

---

## Author

Created and maintained by **Sovan Kandar**.

- GitHub: https://github.com/sovankandar
- npm: https://www.npmjs.com/sovankandar

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT License

Copyright (c) 2026 sovan kandar
