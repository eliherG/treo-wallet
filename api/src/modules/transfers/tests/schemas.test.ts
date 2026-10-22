import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTransferSchema } from '../schemas.js';

const sourceAccountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const destinationAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const beneficiaryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const validRequest = {
  sourceAccountId,
  destinationAccountId,
  amount: '150.25',
  concept: 'Renta octubre',
  reference: '0001234',
};

test('T-13 esquema: acepta destino propio y conserva importe y referencia como cadenas', () => {
  assert.deepEqual(createTransferSchema.parse(validRequest), validRequest);
  const parsed = createTransferSchema.parse({ ...validRequest, amount: '1.20', reference: '0000000' });
  assert.equal(parsed.amount, '1.20');
  assert.equal(parsed.reference, '0000000');
});

test('T-13 esquema: acepta exclusivamente un beneficiario como alternativa al destino directo', () => {
  const request = { sourceAccountId, beneficiaryId, amount: '0.01', concept: 'A', reference: '0' };
  assert.deepEqual(createTransferSchema.parse(request), request);
  assert.equal(createTransferSchema.safeParse({ ...validRequest, beneficiaryId }).success, false);
  assert.equal(createTransferSchema.safeParse({
    sourceAccountId, amount: '1', concept: 'A', reference: '0',
  }).success, false);
  for (const destination of [
    { beneficiaryId: null },
    { destinationAccountId: null },
    { beneficiaryId: null, destinationAccountId },
    { beneficiaryId, destinationAccountId: null },
    { beneficiaryId: null, destinationAccountId: null },
  ]) {
    assert.equal(createTransferSchema.safeParse({
      sourceAccountId, amount: '1', concept: 'A', reference: '0', ...destination,
    }).success, false);
  }
});

test('T-13 esquema: valida y normaliza todos los UUID para resolver la misma identidad', () => {
  assert.equal(createTransferSchema.parse({
    ...validRequest, sourceAccountId: sourceAccountId.toUpperCase(),
  }).sourceAccountId, sourceAccountId);
  assert.equal(createTransferSchema.parse({
    ...validRequest, destinationAccountId: destinationAccountId.toUpperCase(),
  }).destinationAccountId, destinationAccountId);
  assert.equal(createTransferSchema.parse({
    sourceAccountId, beneficiaryId: beneficiaryId.toUpperCase(), amount: '1', concept: 'A', reference: '0',
  }).beneficiaryId, beneficiaryId);

  for (const invalid of ['', 'not-a-uuid', '123', ` ${sourceAccountId}`, `${sourceAccountId}\n`, 123, null]) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, sourceAccountId: invalid }).success, false);
    assert.equal(createTransferSchema.safeParse({ ...validRequest, destinationAccountId: invalid }).success, false);
    assert.equal(createTransferSchema.safeParse({
      sourceAccountId, beneficiaryId: invalid, amount: '1', concept: 'A', reference: '0',
    }).success, false);
  }
});

test('T-13 esquema: rechaza propiedades adicionales sin confiar en identidad o clasificación del cliente', () => {
  const extraFields = {
    userId: sourceAccountId,
    senderUserId: sourceAccountId,
    isInternal: true,
    kind: 'OWN_ACCOUNTS',
    amountCents: '15025',
    currency: 'MXN',
    clabe: '002180032240946700',
    unexpected: 'value',
  };
  for (const [key, value] of Object.entries(extraFields)) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, [key]: value }).success, false, key);
  }
});

test('T-13 esquema: exige cuerpo objeto y todos los campos obligatorios', () => {
  for (const invalid of [undefined, null, true, 1, 'request', [], [validRequest]]) {
    assert.equal(createTransferSchema.safeParse(invalid).success, false);
  }
  for (const field of ['sourceAccountId', 'amount', 'concept', 'reference']) {
    const request: Record<string, unknown> = { ...validRequest };
    delete request[field];
    assert.equal(createTransferSchema.safeParse(request).success, false, field);
    assert.equal(createTransferSchema.safeParse({ ...validRequest, [field]: null }).success, false, field);
  }
});

test('T-13 esquema: aplica el parser exacto y sus límites al importe de entrada', () => {
  for (const amount of ['0.01', '1', '1.2', '1.20', '90071992547409.93', '92233720368547758.07']) {
    assert.equal(createTransferSchema.parse({ ...validRequest, amount }).amount, amount);
  }
  for (const amount of [
    '', '0', '0.00', '-1', '+1', '1e2', ' 1', '1 ', '1\n', '1.001', '01', '.01', '1.',
    '92233720368547758.08', '92233720368547759', '9'.repeat(10000), 1, 1n, null,
  ]) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, amount }).success, false);
  }
});

test('T-13 esquema: D-04 aplica longitud de concepto después del trim autorizado', () => {
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: ' \tPago de renta\r\n' }).concept, 'Pago de renta');
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: '  A  ' }).concept, 'A');
  const maximum = 'A'.repeat(140);
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: `   ${maximum}   ` }).concept, maximum);
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: 'Pago  de\nrenta' }).concept, 'Pago  de\nrenta');
  for (const concept of ['', ' ', '\t\r\n', '\u00a0', 'A'.repeat(141), ` ${'A'.repeat(141)} `, 123, null]) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, concept }).success, false);
  }
});

test('T-13 esquema: cuenta puntos de código Unicode como char_length de PostgreSQL', () => {
  const maximumEmoji = '💸'.repeat(140);
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: maximumEmoji }).concept, maximumEmoji);
  assert.equal(createTransferSchema.safeParse({ ...validRequest, concept: '💸'.repeat(141) }).success, false);
  assert.equal(createTransferSchema.safeParse({ ...validRequest, concept: `${'A'.repeat(139)}💸` }).success, true);
  assert.equal(createTransferSchema.safeParse({ ...validRequest, concept: `${'A'.repeat(140)}💸` }).success, false);

  // PostgreSQL cuenta los acentos combinantes por separado; no normalizamos el texto recibido.
  const combining = 'e\u0301'.repeat(70);
  assert.equal(createTransferSchema.parse({ ...validRequest, concept: combining }).concept, combining);
  assert.equal(createTransferSchema.safeParse({ ...validRequest, concept: `${combining}A` }).success, false);
  for (const concept of ['Pago\u0000renta', '\ud800', '\udc00', 'A\ud800B', 'A\udc00B']) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, concept }).success, false);
  }
});

test('T-13 esquema: referencia ASCII de uno a siete dígitos sin trim ni coerción', () => {
  for (const reference of ['0', '1', '0001234', '0000000', '1234567']) {
    assert.equal(createTransferSchema.parse({ ...validRequest, reference }).reference, reference);
  }
  for (const reference of [
    '', '12345678', ' 1', '1 ', '1\n', '1\r\n', '1\u2028', '1\u2029',
    '+1', '-1', '1.0', '1e2', '1a', '１', '١', '1 2', 1234, null,
  ]) {
    assert.equal(createTransferSchema.safeParse({ ...validRequest, reference }).success, false);
  }
});
