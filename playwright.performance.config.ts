import { defineConfig } from '@playwright/test';
import smoke from './playwright.config';
export default defineConfig({
  ...smoke,
  testDir: './tests/performance',
  timeout: 45_000,
  reporter: [['list']],
  outputDir: 'artifacts/benchmarks/browser',
});
