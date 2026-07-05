# Changelog

All notable changes to Phtps will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-07-04

### First stable release.

### Added
- **Core HTTP client** — `createHttpClient()` and default `Phtps` singleton built on native `fetch`
- **Plugin system** — typed `PhtpsPlugin` interface with `install(client: IHttpClient)` pattern
- **RetryPlugin** — exponential backoff with jitter, custom `retryCondition`, `retryDelay` function
- **AuthPlugin** — reactive 401 token refresh, concurrent request queuing, `TokenRotationManager` for proactive pre-expiry rotation
- **CachePlugin** — TTL-based response caching, pluggable adapter interface (`MemoryCacheAdapter`, `LocalStorageCacheAdapter`)
- **DedupePlugin** — in-flight GET request deduplication, configurable per request via `deduplicate` flag
- **QueuePlugin** — concurrency-limited request queue with `pause()`, `resume()`, `clear()`, `setConcurrency()`
- **EncryptionPlugin** — AES-GCM payload encryption via native `crypto.subtle`, PBKDF2-SHA256 key derivation with random salt per call
- **CsrfPlugin** — CSRF token injection from cookie or custom getter, configurable methods and origin whitelist
- **PaginationPlugin** — `page`, `cursor`, and `offset` strategies; `aggregate` and `prefetch` modes; adaptive idle prefetching
- **PaymentPlugin** — HMAC-SHA256 request signing, idempotency keys, X-Timestamp replay protection, sensitive field masking, rate limiting
- **SSE streaming** — `stream()` with `streamType: 'sse'`, chunk boundary buffering, flush handler for final events
- **NDJSON streaming** — `streamType: 'json'` with per-line parsing and flush
- **Upload progress** — `onUploadProgress` via XHR fallback
- **Download progress** — `onDownloadProgress` via `ReadableStream`
- **Full TypeScript** — `IHttpClient`, `IInterceptorManager`, `ICacheManager`, `IQueueManager`, `HttpResponse<T>`, `HttpError`, `HttpStreamResponse`
- **Zero dependencies** — built entirely on native Web APIs. Node.js 18+, all modern browsers.
- **Dual ESM / CJS build** — `exports` map with subpath `phtps/plugins`
- **Tree-shakeable** — `sideEffects: false`

---

## [Unreleased]

- Nothing yet.

---

<!-- Links -->
[1.0.0]: https://github.com/your-username/phtps/releases/tag/v1.0.0
[Unreleased]: https://github.com/your-username/phtps/compare/v1.0.0...HEAD
