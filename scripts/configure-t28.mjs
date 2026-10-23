import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const path = resolve('mobile/package.json');
const pkg = JSON.parse(readFileSync(path, 'utf8'));
if (pkg.name !== '@treo/mobile' || !pkg.scripts?.test?.includes('src/features/tests/*.test.ts')) {
  throw new Error('T-28 requiere T-27 integrado. No se modificaron los scripts.');
}
pkg.scripts.test = 'tsx --test src/auth/tests/*.test.ts src/features/tests/*.test.ts src/features/transfers/tests/*.test.ts';
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('T-28: pruebas móviles incluyen auth, consultas y transferencias.');
