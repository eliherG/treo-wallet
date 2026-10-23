import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  '.github/workflows/ci.yml',
  'scripts/ci-run-api-tests.mjs',
  'docs/ci.md',
  'db/init/01-bootstrap.sh',
  'api/package.json',
  'web/package.json',
  'mobile/package.json',
  'package-lock.json',
];
const absent = required.filter((file) => !existsSync(resolve(file)));
if (absent.length) throw new Error(`T-31: missing baseline files: ${absent.join(', ')}`);

const pkgFile = resolve('package.json');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
const scripts = JSON.parse(readFileSync('api/package.json', 'utf8')).scripts ?? {};
if (!pkg.workspaces?.length || !scripts['db:migrate'] || !scripts['test:financial:integrity']) {
  throw new Error('T-31: monorepo/API baseline does not match the completed T-19/T-30 state');
}

// npm 12 blocks all dependency installation scripts unless reviewed. Limit
// approvals to packages needed by CI; refuse to override prior explicit policy.
const intended = {
  'argon2': true,
  'esbuild': true,
  '@scarf/scarf': false,
};
const existing = pkg.allowScripts ?? {};
for (const [name, allowed] of Object.entries(intended)) {
  if (name in existing && existing[name] !== allowed) {
    throw new Error(`T-31: conflicting existing allowScripts policy for ${name}`);
  }
}
pkg.allowScripts = { ...existing, ...intended };
writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('T-31: npm 12 allowScripts policy prepared (argon2, esbuild allowed; @scarf/scarf denied).');
console.log('T-31: npm ci and PostgreSQL/GitHub Actions must still be verified in a real runner.');
