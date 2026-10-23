import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filename = resolve('mobile/package.json');
const pkg = JSON.parse(readFileSync(filename, 'utf8'));
if (pkg.name !== '@treo/mobile' || !pkg.scripts?.test?.includes('auth/tests')) {
  throw new Error('T-27 requiere @treo/mobile ya configurado por T-26. No se modificó package.json.');
}
pkg.dependencies = { ...pkg.dependencies, '@treo/shared': '0.0.0' };
pkg.scripts.test = 'tsx --test src/auth/tests/*.test.ts src/features/tests/*.test.ts';
writeFileSync(filename, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('T-27: pruebas móviles incluyen autenticación y consulta financiera.');
