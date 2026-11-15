import { spawnSync } from 'node:child_process';

const raw = process.env.TWYNIX_TEST_DATABASE_URL;
if (!raw) {
  console.error(
    'PostgreSQL gate NOT RUN: set TWYNIX_TEST_DATABASE_URL to a disposable loopback twynix_test_* database.',
  );
  process.exit(1);
}
let url;
try {
  url = new URL(raw);
} catch {
  console.error('Invalid isolated test database URL.');
  process.exit(1);
}
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  !/^\/twynix_test_[a-z0-9_]+$/.test(url.pathname) ||
  url.search ||
  url.hash
) {
  console.error(
    'Refusing database tests: require loopback host, twynix_test_* database, and no URL options.',
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', 'tests/postgres/repository.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: raw, ENABLE_DEVICE_COMMANDS: 'false' },
  },
);
process.exitCode = result.status ?? 1;
