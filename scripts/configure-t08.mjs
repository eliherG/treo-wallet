/** Configura exclusivamente los scripts T-08 sin perder los existentes. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPath = resolve(root, 'package.json');
const apiPath = resolve(root, 'api/package.json');
const rootPkg = JSON.parse(readFileSync(rootPath, 'utf8'));
const apiPkg = JSON.parse(readFileSync(apiPath, 'utf8'));
if (!rootPkg.workspaces?.includes('api') || apiPkg.name !== '@treo/api') {
  throw new Error('No se encontró el workspace esperado @treo/api');
}
apiPkg.scripts = {
  ...apiPkg.scripts,
  dev: 'tsx watch src/server.ts',
  start: 'tsx src/server.ts',
  'test:http': 'tsx --test src/http/tests/*.test.ts',
};
rootPkg.scripts = {
  ...rootPkg.scripts,
  dev: 'npm run dev -w @treo/api',
  'test:http': 'npm run test:http -w @treo/api',
};
writeFileSync(rootPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
writeFileSync(apiPath, `${JSON.stringify(apiPkg, null, 2)}\n`);
console.log('T-08: scripts de API y pruebas HTTP configurados.');
