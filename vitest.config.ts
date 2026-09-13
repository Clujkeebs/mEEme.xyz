import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
    // Both providers pace real requests against a rate limit — Helius at
    // 125ms, GeckoTerminal at 2s (its free tier is ~30/minute). The pacer is
    // a module-level queue that persists across tests in the same file, so a
    // suite exercising the real fetch path several times in one file would
    // otherwise queue behind its own prior calls and cost seconds per test:
    // top-pools.test.ts alone went from milliseconds to 2-4s a test. Neither
    // pace exists to slow down a test suite that never leaves the process.
    env: { HELIUS_MIN_INTERVAL_MS: '0', GECKOTERMINAL_MIN_INTERVAL_MS: '0' },
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
