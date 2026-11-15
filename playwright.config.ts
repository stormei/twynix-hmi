import { defineConfig } from '@playwright/test';

// Always use an owned loopback server, never the developer's live editor/gateway.
export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/engineering/smoke-server.mjs',
    url: 'http://127.0.0.1:4300/',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
