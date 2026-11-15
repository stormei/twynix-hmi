import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

// Adopt recommended rules as written. Existing findings remain visible baseline debt.
export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.angular/**',
      'test-results/**',
      'playwright-report/**',
      'artifacts/**',
      '.data/**',
    ],
  },
  {
    files: [
      'apps/**/*.ts',
      'packages/**/*.ts',
      'tests/**/*.ts',
      'scripts/**/*.ts',
      'playwright*.config.ts',
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
);
