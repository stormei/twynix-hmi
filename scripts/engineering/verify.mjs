import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const steps = ['typecheck', 'lint', 'format:check', 'test', 'build', 'test:smoke'];
const results = [];
mkdirSync('artifacts/verification', { recursive: true });
for (const step of steps) {
  console.log(`\nChecking ${step}…`);
  const result = spawnSync(npm, ['run', step], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const log = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(`artifacts/verification/${step.replaceAll(':', '-')}.log`, log);
  process.stdout.write(log);
  results.push({
    step,
    passed: result.status === 0,
    exitCode: result.status,
    error: result.error?.message,
  });
}
writeFileSync(
  'artifacts/verification/summary.json',
  JSON.stringify({ node: process.version, results }, null, 2) + '\n',
);
console.log('\nVerification results:');
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.step}`);
// Run every gate for useful evidence, but never swallow a failed check.
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
