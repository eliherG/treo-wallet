/** T-32: auditor documental de solo lectura. No modifica git, DB, tokens ni archivos. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
let errors = 0;
let warnings = 0;
function check(ok, description) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${description}`);
  if (!ok) errors++;
}
function warn(description) {
  console.log(`WARN ${description}`);
  warnings++;
}
const required = [
  'README.md', '.env.example', 'docker-compose.yml',
  'api/package.json', 'web/package.json', 'mobile/package.json',
  'specs/treo-assessment-original.md', 'specs/requirements.md',
  'specs/design.md', 'specs/tasks.md', 'specs/ai-log.md',
  'specs/openapi.json', 'docs/aws-deploy.md', 'docs/ci.md',
  'docs/demo-5min.md', 'docs/delivery-checklist.md',
  '.github/workflows/ci.yml', 'scripts/ci-run-api-tests.mjs',
];
for (const filename of required) {
  check(existsSync(resolve(root, filename)), `Archivo requerido: ${filename}`);
}
const read = (f) => existsSync(resolve(root, f)) ? readFileSync(resolve(root, f), 'utf8') : '';
const readme = read('README.md');
for (const snippet of ['db:migrate', 'db:seed', 'test -w @treo/web', 'test -w @treo/mobile', 'api-docs', 'Expo', 'qué haría con más tiempo', 'saldo insuficiente']) {
  check(readme.toLocaleLowerCase('es').includes(snippet.toLocaleLowerCase('es')), `README contiene ${snippet}`);
}
const ci = read('.github/workflows/ci.yml');
for (const snippet of ['postgres:16', 'npm ci', 'check:types', 'ci-run-api-tests.mjs', 'test -w @treo/web', 'test -w @treo/mobile', 'contents: read']) {
  check(ci.includes(snippet), `Workflow CI incluye ${snippet}`);
}
const git = (args) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
};
const trackedEnv = git(['ls-files', '--', '.env', 'api/.env', 'web/.env', 'mobile/.env']);
if (trackedEnv === null) warn('Git no disponible; revisar .env de forma manual');
else check(trackedEnv === '', 'No se versionaron archivos .env de ejecución');
const tracked = git(['log', '--all', '--format=%s']);
if (tracked === null) warn('No hay historial Git accesible');
else {
  const found = new Set([...tracked.matchAll(/\[T-(\d{2})\]/g)].map(m => Number(m[1])));
  const missing = Array.from({length: 31}, (_,i) => i+1).filter(n => !found.has(n));
  console.log(`INFO Historial Git: marcadores T-01..T-31 encontrados ${31-missing.length}/31`);
  if (missing.length) warn(`Verificar manualmente tareas sin marcador visible: ${missing.map(n => `T-${String(n).padStart(2,'0')}`).join(', ')}`);
}
const dirty = git(['status', '--short']);
if (dirty) warn('Árbol de trabajo con cambios (normal mientras preparas T-32); debe quedar limpio tras merge');
console.log(`RESULTADO Auditoría de estructura: ${errors} errores, ${warnings} advertencias.`);
console.log('IMPORTANTE: no verifica por sí mismo video, clon limpio, ejecución de CI ni corrección financiera.');
if (errors) process.exitCode = 1;
