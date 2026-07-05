# Contributing to Phtps

Thank you for taking the time to contribute. This document explains how to get set up, what the codebase structure means, and what the bar is for a pull request to be merged.

---

## Before You Start

- Check existing [issues](https://github.com/your-username/phtps/issues) before opening a new one.
- For large features or breaking changes, open an issue first to discuss before writing code.
- For bug fixes or small improvements, a PR is welcome directly.

---

## Setup

```bash
git clone https://github.com/your-username/phtps.git
cd phtps
npm install
npm run typecheck    # must pass
npm run test         # must pass
```

Requirements: **Node.js 18+**. No other global tools needed.

---

## Project Structure

```
phtps/
├── config/
│   ├── defaultConfig.ts     # Default values for all config options
│   └── types.ts             # All public TypeScript interfaces
├── core/
│   ├── HttpClient.ts        # Main client class and public methods
│   ├── RequestExecuter.ts   # fetch + XHR execution, abort, progress
│   ├── UrlBuilder.ts        # URL construction and param serialisation
│   ├── CacheManager.ts      # Cache adapter orchestration
│   ├── QueueManager.ts      # Concurrency queue
│   ├── RequestDeduper.ts    # In-flight deduplication map
│   ├── InterceptorManager.ts
│   ├── MiddlewarePipeline.ts
│   ├── StreamReader.ts      # SSE / NDJSON / raw stream parsing
│   ├── TokenRotationManager.ts
│   ├── CsrfManager.ts
│   ├── PaginationManager.ts
│   └── adapters/
│       ├── MemoryCacheAdapter.ts
│       └── LocalStorageCacheAdapter.ts
├── plugins/
│   ├── AuthPlugin.ts
│   ├── CachePlugin.ts
│   ├── CsrfPlugin.ts
│   ├── DedupePlugin.ts
│   ├── EncryptionPlugin.ts
│   ├── PaginationPlugin.ts
│   ├── PaymentPlugin.ts
│   ├── QueuePlugin.ts
│   ├── RetryPlugin.ts
│   └── index.ts             # Barrel — re-exports all plugins
├── utils/
│   └── SimpleCrypto.ts      # AES-GCM + PBKDF2 via crypto.subtle
├── env/
│   └── index.ts             # isBrowser detection (internal only)
├── index.ts                 # Public API surface
├── package.json
├── tsconfig.json
├── tsconfig.build.json      # ESM build
├── tsconfig.cjs.json        # CJS build
└── test/                    # Vitest test files
```

---

## Rules for Every Pull Request

### 1. No mutations in the request pipeline
Config objects and response objects must never be mutated in place. Always return a new object:
```ts
// Wrong
config.headers = newHeaders;
return config;

// Right
return { ...config, headers: newHeaders };
```

### 2. No module-level state in plugins
All plugin state must live inside the `install()` function so that multiple client instances are isolated:
```ts
// Wrong — shared across all clients
let isRefreshing = false;
export const MyPlugin = () => ({ name: 'x', install: (client) => { ... } });

// Right — scoped to each install call
export const MyPlugin = () => ({
  name: 'x',
  install: (client) => {
    let isRefreshing = false; // ← here
  }
});
```

### 3. File naming is PascalCase
All files in `core/`, `plugins/`, and `utils/` use PascalCase (`HttpClient.ts`, `AuthPlugin.ts`). Imports must match exactly — Linux is case-sensitive.

### 4. Zero runtime dependencies
Phtps has no production dependencies and must stay that way. Everything must use native Web APIs. If a feature genuinely cannot be built without a dependency, open an issue to discuss before adding it.

### 5. Every new feature needs a test
- Unit tests go in `test/<FileName>.test.ts`
- Integration tests go in `test/HttpClient.integration.test.ts`
- Tests use **Vitest** and **MSW** (already in devDependencies)

### 6. TypeScript strict mode — always
`tsconfig.json` has `"strict": true`. No `any` unless documenting a known limitation with a comment. The `IHttpClient` interface is typed — plugin authors should not receive `any`.

---

## Running Tests

```bash
npm run test          # run all tests once
npm run test:watch    # watch mode
npm run coverage      # with coverage report
```

---

## Commit Message Format

```
type(scope): short description

feat(retry): add retryOn option to filter by status code
fix(auth): reject queued subscribers when refresh fails
docs(readme): update plugin install order section
test(cache): add TTL expiry test for LocalStorageCacheAdapter
chore(deps): update vitest to 1.6.0
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`

---

## Releasing (maintainers only)

1. Update `CHANGELOG.md` — move `[Unreleased]` items under the new version
2. Bump `version` in `package.json`
3. Run `npm run prepublishOnly` — must pass all checks
4. `git tag v1.x.x && git push --tags`
5. `npm publish`

---

## Code of Conduct

Be direct, be kind, be constructive. Phtps is a technical project — disagreements about design are fine, personal attacks are not.
