/**
 * Prueba aislada de propagación: cambia una COPIA temporal del contrato,
 * regenera en un directorio temporal y comprueba que el tipo nuevo aparece.
 * Jamás modifica specs/openapi.json ni los tipos versionados.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, 'specs/openapi.json');
const generated = resolve(root, 'packages/shared/src/generated/api-types.ts');
const bin = resolve(root, 'node_modules/.bin/openapi-typescript');
const temp = mkdtempSync(join(tmpdir(), 'treo-t07-'));
try {
  const contract = JSON.parse(readFileSync(input, 'utf8'));
  const baseline = readFileSync(generated, 'utf8');
  assert.equal(contract.openapi, '3.1.0');
  assert.ok(!baseline.includes('T07PropagationProbe'));
  contract.components.schemas.T07PropagationProbe = {
    type: 'object',
    properties: { marker: { type: 'string' } },
    required: ['marker'],
  };
  const tempInput = join(temp, 'openapi-probe.json');
  const tempOutput = join(temp, 'api-types-probe.ts');
  writeFileSync(tempInput, JSON.stringify(contract));
  execFileSync(bin, [tempInput, '--output', tempOutput], { cwd: root, stdio: 'pipe' });
  const changed = readFileSync(tempOutput, 'utf8');
  assert.notEqual(changed, baseline, 'El cambio de esquema debe cambiar el tipo generado');
  assert.match(changed, /T07PropagationProbe/, 'No se propagó el esquema de prueba');
  assert.equal(JSON.parse(readFileSync(input, 'utf8')).components.schemas.T07PropagationProbe, undefined);
  console.log('T-07: propagación verificada sobre copia temporal; contrato original intacto.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
