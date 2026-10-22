import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PG_BIGINT_MAX,
  PG_BIGINT_MIN,
  centsToMxn,
  parseMxnToCents,
  serializeCents,
} from '../money.js';

test('T-13 dinero: convierte pesos decimales a centavos exactos sin redondear', () => {
  const cases: Array<[string, bigint]> = [
    ['0.01', 1n],
    ['0.1', 10n],
    ['0.10', 10n],
    ['1', 100n],
    ['1.2', 120n],
    ['1.20', 120n],
    ['150.25', 15025n],
    ['90071992547409.93', 9007199254740993n],
    ['92233720368547758', 9223372036854775800n],
    ['92233720368547758.06', 9223372036854775806n],
    ['92233720368547758.07', 9223372036854775807n],
  ];

  for (const [input, expected] of cases) {
    assert.equal(parseMxnToCents(input), expected, input);
  }
});

test('T-13 dinero: rechaza cero y negativos aunque sean representables en BIGINT', () => {
  for (const input of ['0', '0.0', '0.00', '-0', '-0.00', '-0.01', '-1', '-92233720368547758.08']) {
    assert.throws(() => parseMxnToCents(input), RangeError, input);
  }
});

test('T-13 dinero: rechaza más de dos decimales sin truncar ni redondear', () => {
  for (const input of ['0.001', '0.009', '0.010', '1.000', '1.234', '1.999', '92233720368547758.070']) {
    assert.throws(() => parseMxnToCents(input), RangeError, input);
  }
});

test('T-13 dinero: rechaza el primer centavo fuera de rango y pesos excesivos', () => {
  for (const input of [
    '92233720368547758.08',
    '92233720368547758.1',
    '92233720368547759',
    '9223372036854775807',
    '1'.repeat(10000),
  ]) {
    assert.throws(() => parseMxnToCents(input), RangeError);
  }
});

test('T-13 dinero: exige la cadena decimal completa y el formato del contrato', () => {
  const invalid = [
    '', ' ', '\t', '\n',
    ' 1', '1 ', '1\t', '\n1', '1\n', '1\r\n', '1\u2028', '1\u2029', '\u00a01', '1\u00a0',
    '1 0', '1. 2', '1\u0000',
    '+1', '1e2', '1E2', '1e-2', '0x10', '0b10', 'Infinity', 'NaN',
    '.01', '1.', '.', '1..2', '1.2.3', '1,25', '1,000.00', '1_000',
    '00', '01', '00.01', '01.20', '001.00',
    '１.００', '١.٢٥', '1.２', '$1.00', 'MXN 1.00',
  ];

  for (const input of invalid) {
    assert.throws(() => parseMxnToCents(input), RangeError, JSON.stringify(input));
  }
});

test('T-13 dinero: no convierte implícitamente tipos recibidos en tiempo de ejecución', () => {
  const invalid: unknown[] = [undefined, null, 1, 0.01, 1n, true, [], ['1'], {}, { toString: () => '1' }];
  for (const input of invalid) {
    assert.throws(() => parseMxnToCents(input as string), TypeError);
  }
});

test('T-13 centavos: serializa cero, débitos y ambos límites signed PostgreSQL', () => {
  assert.equal(PG_BIGINT_MIN, -9223372036854775808n);
  assert.equal(PG_BIGINT_MAX, 9223372036854775807n);

  const cases: Array<[bigint, string]> = [
    [0n, '0'],
    [1n, '1'],
    [-1n, '-1'],
    [-15025n, '-15025'],
    [9007199254740993n, '9007199254740993'],
    [PG_BIGINT_MIN, '-9223372036854775808'],
    [PG_BIGINT_MAX, '9223372036854775807'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(serializeCents(input), expected);
    assert.equal(JSON.stringify({ amountCents: serializeCents(input) }), `{"amountCents":"${expected}"}`);
  }
});

test('T-13 centavos: rechaza valores fuera del rango signed PostgreSQL', () => {
  assert.throws(() => serializeCents(PG_BIGINT_MIN - 1n), RangeError);
  assert.throws(() => serializeCents(PG_BIGINT_MAX + 1n), RangeError);
});

test('T-13 centavos: exige bigint en lugar de coercionar números o cadenas', () => {
  for (const input of [undefined, null, 0, 1, '0', '1', true, {}]) {
    assert.throws(() => serializeCents(input as bigint), TypeError);
  }
});

test('T-13 dinero: conversión inversa exacta, incluido el rango completo de PostgreSQL', () => {
  const cases: Array<[bigint, string]> = [
    [0n, '0.00'], [1n, '0.01'], [10n, '0.10'], [100n, '1.00'],
    [120n, '1.20'], [15025n, '150.25'], [-1n, '-0.01'], [-15025n, '-150.25'],
    [9007199254740993n, '90071992547409.93'],
    [PG_BIGINT_MAX, '92233720368547758.07'],
    [PG_BIGINT_MIN, '-92233720368547758.08'],
  ];
  for (const [cents, expected] of cases) {
    assert.equal(centsToMxn(cents), expected);
    // Only positive amounts are valid transfer inputs; zero/signed values are for display.
    if (cents > 0n) assert.equal(parseMxnToCents(centsToMxn(cents)), cents);
  }
  for (const input of [undefined, null, 1, '1', true, {}]) {
    assert.throws(() => centsToMxn(input as bigint), TypeError);
  }
  assert.throws(() => centsToMxn(PG_BIGINT_MAX + 1n), RangeError);
  assert.throws(() => centsToMxn(PG_BIGINT_MIN - 1n), RangeError);
});
