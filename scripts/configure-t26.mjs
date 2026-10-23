import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filename = resolve('mobile/package.json');
const pack = JSON.parse(readFileSync(filename, 'utf8'));
if (pack.name !== '@treo/mobile') throw new Error('Esperaba workspace @treo/mobile; no se modificó package.json');
pack.main = 'index.ts';
pack.scripts = {
  ...pack.scripts,
  dev: 'expo start --lan',
  start: 'expo start --lan',
  test: 'tsx --test src/auth/tests/*.test.ts',
  typecheck: 'tsc --project tsconfig.json --noEmit',
};
writeFileSync(filename, `${JSON.stringify(pack, null, 2)}\n`);
console.log('T-26: workspace mobile configurado; dependencias aún deben instalarse.');
