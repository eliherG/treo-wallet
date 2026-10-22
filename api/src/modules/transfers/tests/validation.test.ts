import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntityManager } from 'typeorm';
import { HttpProblem } from '../../../http/http-problem.js';
import { validateTransferAccounts, validateTransferInstruction } from '../validation.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'ACTIVE', currency: 'MXN' };
const destination = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'ACTIVE', currency: 'MXN' };
const instruction = {
  sourceAccountId: source.id, destinationAccountId: destination.id,
  amount: '150.25', concept: 'Pago', reference: '0001234',
};

function incompatible(error: unknown): boolean {
  assert.ok(error instanceof HttpProblem);
  assert.equal(error.status, 422);
  assert.equal(error.code, 'INVALID_TRANSFER_INSTRUCTION');
  assert.equal(error.publicDetail.includes(source.id), false);
  assert.equal(error.publicDetail.includes(destination.id), false);
  return true;
}

test('T-13 reglas: acepta cuentas diferentes, activas y MXN sin consultar saldos', () => {
  assert.doesNotThrow(() => validateTransferAccounts(Object.freeze(source), Object.freeze(destination)));
});

test('T-13 CA-RF07-02: rechaza la misma identidad UUID incluso con diferente capitalización', () => {
  assert.throws(() => validateTransferAccounts(source, source), incompatible);
  assert.throws(() => validateTransferAccounts(source, { ...source, id: source.id.toUpperCase() }), incompatible);
});

test('T-13 reglas: exige ACTIVE en ambos extremos y rechaza estados desconocidos', () => {
  for (const status of ['BLOCKED', 'INACTIVE', 'CLOSED', '', 'active']) {
    assert.throws(() => validateTransferAccounts({ ...source, status }, destination), incompatible);
    assert.throws(() => validateTransferAccounts(source, { ...destination, status }), incompatible);
  }
});

test('T-13 reglas: exige MXN en ambos extremos sin relajar el CHECK de PostgreSQL', () => {
  // Invalid currencies cannot be inserted into the real DB; test the defensive rule here.
  for (const currency of ['USD', 'EUR', '', 'mxn']) {
    assert.throws(() => validateTransferAccounts({ ...source, currency }, destination), incompatible);
    assert.throws(() => validateTransferAccounts(source, { ...destination, currency }), incompatible);
  }
});

test('T-13 seguridad: contexto autenticado inválido nunca llega al repositorio', async () => {
  let accessed = false;
  // Deliberately incomplete manager: any persistence access must fail this test.
  const manager = {
    getRepository() {
      accessed = true;
      throw new Error('Unexpected persistence access');
    },
  } as unknown as EntityManager;
  for (const invalid of [undefined, null, '', 'not-a-uuid', 123, {}, `${userId}\n`]) {
    await assert.rejects(validateTransferInstruction(manager, invalid as string, instruction), {
      message: 'Valid authenticated user context is required',
    });
  }
  assert.equal(accessed, false);
});

test('T-13 CA-RF06-04/05: entradas inválidas fallan antes de consultar persistencia', async () => {
  let accessed = false;
  const manager = {
    getRepository() {
      accessed = true;
      throw new Error('Unexpected persistence access');
    },
  } as unknown as EntityManager;
  for (const input of [
    { ...instruction, userId }, { ...instruction, amount: '0' },
    { ...instruction, concept: ' ' }, { ...instruction, reference: 1234 },
    { ...instruction, beneficiaryId: userId },
    { ...instruction, destinationAccountId: undefined },
  ]) {
    await assert.rejects(validateTransferInstruction(manager, userId, input), (error: unknown) => {
      assert.ok(error instanceof HttpProblem);
      assert.equal(error.status, 400);
      assert.equal(error.code, 'INVALID_REQUEST');
      return true;
    });
  }
  assert.equal(accessed, false);
});

test('T-13 errores: una falla técnica no se convierte en un rechazo definitivo de negocio', async () => {
  const failure = new Error('Database unavailable');
  const manager = {
    getRepository() {
      return { findOne: async () => { throw failure; } };
    },
  } as unknown as EntityManager;
  await assert.rejects(validateTransferInstruction(manager, userId, instruction), (error: unknown) => {
    assert.equal(error, failure);
    assert.equal(error instanceof HttpProblem, false);
    return true;
  });
});
