import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['Eping/**/*.ts'],
      exclude: ['Eping/test/**/*.ts'],
      reporter: ['text', 'json', 'html'],
    },
  },
});
