import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { clabeCheckDigit, isValidClabe, maskClabe } from '../clabe.js';
import { createBeneficiarySchema } from '../schemas.js';

test('T-12 CLABE: ejemplo normativo DOF con dígito de control cero', () => {
  const prefix = '00218003224094670';
  assert.equal(clabeCheckDigit(prefix), '0');
  assert.equal(isValidClabe('002180032240946700'), true);
});

test('T-12 CLABE: checksum no cero y prefijos sintéticos válidos', () => {
  assert.equal(clabeCheckDigit('12345678901234567'), '3');
  assert.equal(isValidClabe('123456789012345673'), true);
  const generated = generateDemoClabe();
  assert.match(generated, /^999[0-9]{15}$/);
  assert.equal(isValidClabe(generated), true);
});

test('T-12 CLABE: longitud, letras, espacio y dígito incorrecto se rechazan', () => {
  for (const invalid of ['00218003224094670', '0021800322409467000',
    '00218003224094670X', '002180032240946701',
    ' 002180032240946700', '002180032240946700 ']) {
    assert.equal(isValidClabe(invalid), false);
  }
  assert.equal(isValidClabe(null), false);
  assert.equal(isValidClabe(2180032240946700), false);
  assert.throws(() => clabeCheckDigit('1234'), RangeError);
});

test('T-12 CLABE: el esquema rechaza objetos extra y aplica límites tras trim', () => {
  const clabe = '002180032240946700';
  const valid = createBeneficiarySchema.parse({ name: '  Luz  ', alias: '  Casa  ', clabe });
  assert.deepEqual(valid, { name: 'Luz', alias: 'Casa', clabe });
  assert.equal(createBeneficiarySchema.safeParse({ name: ' ', alias: 'Casa', clabe }).success, false);
  assert.equal(createBeneficiarySchema.safeParse({ name: 'Luz', alias: ' ', clabe }).success, false);
  assert.equal(createBeneficiarySchema.safeParse({ name: 'X'.repeat(101), alias: 'A', clabe }).success, false);
  assert.equal(createBeneficiarySchema.safeParse({ name: 'Luz', alias: 'X'.repeat(81), clabe }).success, false);
  assert.equal(createBeneficiarySchema.safeParse({ name: 'Luz', alias: 'Casa', clabe, userId: 'impersonated' }).success, false);
});

test('T-12 CLABE: máscara de salida no expone 14 dígitos iniciales', () => {
  assert.equal(maskClabe('002180032240946700'), '**************6700');
  assert.throws(() => maskClabe('123'), Error);
});
