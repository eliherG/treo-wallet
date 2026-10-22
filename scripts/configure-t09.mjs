/** T-09 scripts and documented configuration. Safe to run repeatedly. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootManifest = resolve(root, 'package.json');
const apiManifest = resolve(root, 'api/package.json');
const examplePath = resolve(root, '.env.example');
const rootPkg = JSON.parse(readFileSync(rootManifest, 'utf8'));
const apiPkg = JSON.parse(readFileSync(apiManifest, 'utf8'));
if (apiPkg.name !== '@treo/api' || !rootPkg.workspaces?.includes('api')) {
  throw new Error('Expected @treo/api workspace not found');
}
apiPkg.scripts = { ...apiPkg.scripts,
  'test:auth': 'tsx --test src/modules/auth/tests/*.integration.test.ts',
};
rootPkg.scripts = { ...rootPkg.scripts,
  'test:auth': 'npm run test:auth -w @treo/api',
};
writeFileSync(rootManifest, `${JSON.stringify(rootPkg, null, 2)}\n`);
writeFileSync(apiManifest, `${JSON.stringify(apiPkg, null, 2)}\n`);
const example = readFileSync(examplePath, 'utf8');
if (!/^JWT_ACCESS_SECRET=/m.test(example)) {
  writeFileSync(examplePath, `${example.replace(/\s*$/, '\n')}\n# Mínimo 32 bytes aleatorios; nunca versionar el secreto real.\nJWT_ACCESS_SECRET=REPLACE_WITH_RANDOM_SECRET_OF_32_BYTES_OR_MORE\n`);
}
console.log('T-09: test:auth y JWT_ACCESS_SECRET documentados; .env real sin cambios.');
