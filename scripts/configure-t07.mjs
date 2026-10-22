/** Configura solamente T-07, conservando el resto de scripts/workspaces. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootManifestPath = resolve(root, 'package.json');
const sharedManifestPath = resolve(root, 'packages/shared/package.json');

function load(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function save(path, obj) {
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}
const rootPkg = load(rootManifestPath);
const sharedPkg = load(sharedManifestPath);
if (!rootPkg.workspaces?.includes('packages/shared') || sharedPkg.name !== '@treo/shared') {
  throw new Error('El monorepo no contiene el workspace esperado @treo/shared');
}

sharedPkg.type = 'module';
sharedPkg.types = './src/index.ts';
sharedPkg.exports = {
  ...sharedPkg.exports,
  '.': { types: './src/index.ts', default: './src/index.ts' },
};
sharedPkg.scripts = {
  ...sharedPkg.scripts,
  'generate:types': 'openapi-typescript ../../specs/openapi.json --output ./src/generated/api-types.ts',
  'check:types': 'openapi-typescript ../../specs/openapi.json --output ./src/generated/api-types.ts --check',
};
rootPkg.scripts = {
  ...rootPkg.scripts,
  'generate:types': 'npm run generate:types -w @treo/shared',
  'check:types': 'npm run check:types -w @treo/shared',
  'test:types': 'node scripts/check-contract-propagation.mjs',
};
save(sharedManifestPath, sharedPkg);
save(rootManifestPath, rootPkg);
console.log('T-07: scripts, types y exports configurados; otros workspaces sin cambios.');
