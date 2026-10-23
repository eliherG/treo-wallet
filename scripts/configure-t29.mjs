import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packagePath = resolve('mobile/package.json');
const tsconfigPath = resolve('mobile/tsconfig.json');
const required = [
  'mobile/src/features/transfers/tests/t28.test.ts',
  'mobile/src/features/security/tests/t29.test.ts',
  'mobile/src/screens/tests/transfers.ui.test.tsx',
  'mobile/jest-t29.config.cjs',
];
if (required.some(path => !existsSync(resolve(path)))) throw new Error('Faltan archivos T-28/T-29. No se cambió package.json.');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
if (pkg.name !== '@treo/mobile' || !pkg.scripts?.test?.includes('src/features/transfers/tests/*.test.ts')) {
  throw new Error('T-29 requiere T-28 integrado y las pruebas anteriores. No se cambió package.json.');
}
pkg.scripts['test:logic'] = 'tsx --test src/auth/tests/*.test.ts src/features/tests/*.test.ts src/features/transfers/tests/*.test.ts src/features/security/tests/t29.test.ts';
pkg.scripts['test:ui'] = 'jest --config jest-t29.config.cjs --runInBand --no-coverage';
pkg.scripts.test = 'npm run test:logic && npm run test:ui';
const config = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
config.compilerOptions ??= {};
const types = config.compilerOptions.types ?? [];
if (!types.includes('jest')) config.compilerOptions.types = [...types, 'jest'];
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(tsconfigPath, `${JSON.stringify(config, null, 2)}\n`);
console.log('T-29: 35 pruebas previas + 6 casos de seguridad Node + suite UI RN (Jest).');
console.log('Antes de probar, instalar dependencias de desarrollo con las versiones de la guía.');
