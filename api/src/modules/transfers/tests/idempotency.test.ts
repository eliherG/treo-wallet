import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  canonicalTransferPayload, hashTransferPayload, normalizeTransferIntent,
  validateIdempotencyKey, type ResolvedTransferIntent,
} from '../idempotency.js';

const sender = randomUUID();
const dest = randomUUID();
const beneficiary = randomUUID();
const make = (): ResolvedTransferIntent => ({
  kind: 'OWN_ACCOUNTS', sourceAccountId: sender, destinationAccountId: dest,
  amountCents: 10_025n, concept: 'Renta', reference: '0000123',
});

test('T-14: hash estable ante distinto orden de las propiedades del objeto', () => {
  const a = make();
  const b = { reference: '0000123', concept: 'Renta', amountCents: 10_025n,
    destinationAccountId: dest, sourceAccountId: sender, kind: 'OWN_ACCOUNTS' } as const;
  assert.equal(canonicalTransferPayload(a), canonicalTransferPayload(b));
  assert.equal(hashTransferPayload(a), hashTransferPayload(b));
  assert.match(hashTransferPayload(a), /^[a-f0-9]{64}$/);
});

test('T-14: UUIDs equivalentes de distinta capitalización dan mismo hash', () => {
  assert.equal(hashTransferPayload(make()), hashTransferPayload({
    ...make(), sourceAccountId: sender.toUpperCase(), destinationAccountId: dest.toUpperCase(),
  }));
});

test('T-14: importe en centavos exactos sin números en payload canónico', () => {
  const payload = JSON.parse(canonicalTransferPayload(make())) as { amountCents: unknown };
  assert.equal(payload.amountCents, '10025');
  assert.notEqual(hashTransferPayload(make()), hashTransferPayload({ ...make(), amountCents: 10_026n }));
});

test('T-14: modificar cada campo de la intención modifica el fingerprint', () => {
  const base = hashTransferPayload(make());
  const variants: ResolvedTransferIntent[] = [
    { ...make(), sourceAccountId: randomUUID() },
    { ...make(), destinationAccountId: randomUUID() },
    { ...make(), concept: 'Renta 2' },
    { ...make(), reference: '0000124' },
  ];
  for (const v of variants) assert.notEqual(hashTransferPayload(v), base);
});

test('T-14: conservar ceros iniciales de la referencia', () => {
  assert.notEqual(hashTransferPayload(make()), hashTransferPayload({ ...make(), reference: '123' }));
  assert.match(canonicalTransferPayload(make()), /0000123/);
});

test('T-14: modalidades diferentes y distintos beneficiarios producen hashes diferentes', () => {
  const beneficiaryIntent: ResolvedTransferIntent = {
    kind: 'BENEFICIARY', sourceAccountId: sender, beneficiaryId: beneficiary,
    destinationAccountId: dest, amountCents: 10_025n, concept: 'Renta', reference: '0000123',
  };
  assert.notEqual(hashTransferPayload(make()), hashTransferPayload(beneficiaryIntent));
  assert.notEqual(hashTransferPayload(beneficiaryIntent),
    hashTransferPayload({ ...beneficiaryIntent, beneficiaryId: randomUUID() }));
});

test('T-14: CLABE resuelta actual no es parte del payload original de beneficiario', () => {
  const a: ResolvedTransferIntent = {
    kind: 'BENEFICIARY', sourceAccountId: sender, beneficiaryId: beneficiary,
    destinationAccountId: dest, amountCents: 10_025n, concept: 'Renta', reference: '0000123',
  };
  assert.equal(hashTransferPayload(a), hashTransferPayload({ ...a, destinationAccountId: randomUUID() }));
});

test('T-14: llave acepta los límites OpenAPI y no modifica el contenido recibido', () => {
  assert.equal(validateIdempotencyKey('12345678'), '12345678');
  assert.equal(validateIdempotencyKey('X'.repeat(128)), 'X'.repeat(128));
  assert.equal(validateIdempotencyKey('  ABCDEF'), '  ABCDEF');
  assert.throws(() => validateIdempotencyKey('1234567'), RangeError);
  assert.throws(() => validateIdempotencyKey('X'.repeat(129)), RangeError);
  assert.throws(() => validateIdempotencyKey(null), RangeError);
});

test('T-14: instrucciones mal formadas se rechazan antes de SQL', () => {
  assert.throws(() => normalizeTransferIntent({ ...make(), amountCents: 0n }), RangeError);
  assert.throws(() => normalizeTransferIntent({ ...make(), amountCents: 9_223_372_036_854_775_808n }), RangeError);
  assert.throws(() => normalizeTransferIntent({ ...make(), reference: '12345678' }), RangeError);
  assert.throws(() => normalizeTransferIntent({ ...make(), concept: ' Sin normalizar ' }), RangeError);
  assert.throws(() => normalizeTransferIntent({ ...make(), destinationAccountId: sender }), RangeError);
  assert.throws(() => normalizeTransferIntent({ ...make(), sourceAccountId: 'invalid' }), RangeError);
});
