import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Explicit, reviewable allowlist. Do not run T-19 persistent stress or
// the T-20 100k movement seed in ordinary CI (immutable test fixtures).
const suites = [
  'test:http',
  'test:db',
  'test:auth',
  'test:accounts',
  'test:beneficiaries',
  'test:transfers:unit',
  'test:transfers:integration',
  'test:transfers:idempotency:unit',
  'test:transfers:idempotency:integration',
  'test:transfers:atomic',
  'test:transfers:otp:unit',
  'test:transfers:otp:integration',
  'test:transfers:status',
  'test:movements:unit',
  'test:movements:integration',
  'test:financial:integrity',
  'test:seed',
];

const pkg = JSON.parse(readFileSync(resolve('api/package.json'), 'utf8'));
if (pkg.name !== '@treo/api') throw new Error('Expected @treo/api workspace');
const missing = suites.filter((name) => typeof pkg.scripts?.[name] !== 'string');
if (missing.length) {
  console.error(`T-31: API test scripts missing: ${missing.join(', ')}`);
  process.exit(1);
}

for (const [index, suite] of suites.entries()) {
  console.log(`\nT-31: [${index + 1}/${suites.length}] ${suite}`);
  const result = spawnSync('npm', ['run', suite, '--workspace', '@treo/api'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  if (result.error) {
    console.error(`T-31: could not execute ${suite}`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`T-31: ${suite} failed (exit ${result.status ?? 'unknown'}).`);
    process.exit(result.status || 1);
  }
}
console.log(`\nT-31: ${suites.length} API test suites passed.`);
