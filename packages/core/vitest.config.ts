import { defineConfig } from 'vitest/config';

// Live tests are environment-gated AND excluded from the default test run.
// Use `pnpm --filter @fx/core run test:live` for HTTP-API live tests, or
// `pnpm --filter @fx/core run test:live:scrape` for Playwright-based ones.
const enableLive = process.env.FX_LIVE === '1' || process.env.FX_LIVE_SCRAPE === '1';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: enableLive
      ? ['node_modules/**']
      : ['node_modules/**', 'test/live/**'],
  },
});
