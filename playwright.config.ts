import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 375, height: 720 },
  },
  webServer: {
    // The dev server restarts on abrupt WebSocket closes; test the prod build.
    command: 'pnpm build && node .output/server/index.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
