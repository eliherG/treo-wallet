import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MobileAuthController, MobileAuthError } from '../../../auth/controller';
import type { AuthTransport, MobileAuthReply, TokenStorage } from '../../../auth/types';
import type { Account } from '../../accounts/accounts';
import { MobileTransferManager, type PendingIntent, type PendingIntentStore } from '../../transfers/manager';
import type { Transfer, TransferForm } from '../../transfers/draft';
import type { TransferService } from '../../transfers/service';
import { createAuthorizedGet } from '../../../api/authorized-get';

const OWNER_A = '99999999-9999-4999-8999-999999999999';
const OWNER_B = '88888888-8888-4888-8888-888888888888';
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const accounts: Account[] = [
  { id: ACCOUNT_A, clabeMasked: '**************0011', currency: 'MXN', balanceCents: '1000000', status: 'ACTIVE' },
  { id: ACCOUNT_B, clabeMasked: '**************0022', currency: 'MXN', balanceCents: '200000', status: 'ACTIVE' },
];
const form: TransferForm = {
  mode: 'OWN_ACCOUNTS', sourceAccountId: ACCOUNT_A, targetId: ACCOUNT_B,
  amount: '5000.01', concept: 'Prueba T29', reference: '0000123',
};
const transfer: Transfer = {
  id: ID, status: 'COMPLETED', kind: 'OWN_ACCOUNTS', sourceAccountId: ACCOUNT_A,
  destinationAccountMasked: '**************0022', amountCents: '500001',
  concept: form.concept, reference: form.reference,
  requiresOtp: false, createdAt: '2026-10-23T12:00:00.000Z', completedAt: '2026-10-23T12:00:01.000Z', rejectionCode: null,
};
function memoryStore() {
  const data = new Map<string, PendingIntent>();
  const store: PendingIntentStore = {
    read: async owner => structuredClone(data.get(owner) ?? null),
    write: async (owner, record) => { data.set(owner, structuredClone(record)); },
    remove: async owner => { data.delete(owner); },
  };
  return { data, store };
}
function service(overrides: Partial<TransferService>): TransferService {
  return { send: async () => transfer, get: async () => transfer, confirm: async () => transfer, ...overrides };
}

test('T-29: una intención solo contiene datos autorizados, nunca secretos de sesión ni OTP', async () => {
  const { data, store } = memoryStore();
  const manager = new MobileTransferManager(OWNER_A, store, service({}));
  await manager.begin(form, accounts, [], KEY);
  const persisted = JSON.stringify(data.get(OWNER_A));
  assert.match(persisted, /0000123/);
  assert.match(persisted, new RegExp(KEY));
  for (const secret of ['otp', 'accessToken', 'refreshToken', 'Bearer', 'password']) {
    assert.ok(!persisted.includes(secret), `Campo secreto inesperado: ${secret}`);
  }
});

test('T-29: una intención pendiente no puede reaparecer en la sesión de otro usuario', async () => {
  const { store } = memoryStore();
  const managerA = new MobileTransferManager(OWNER_A, store, service({}));
  await managerA.begin(form, accounts, [], KEY);
  const managerB = new MobileTransferManager(OWNER_B, store, service({}));
  assert.equal((await managerB.restore()).intent, null);
  assert.equal((await managerA.restore()).intent?.ownerId, OWNER_A);
});

test('T-29: corrupción de ownerId en intención segura se rechaza sin borrar evidencia pendiente', async () => {
  const { store, data } = memoryStore();
  await store.write(OWNER_A, {
    ownerId: OWNER_B, key: KEY, request: { sourceAccountId: ACCOUNT_A, destinationAccountId: ACCOUNT_B,
      amount: form.amount, concept: form.concept, reference: form.reference },
    sourceLabel: 'A', targetLabel: 'B', amountCents: '500001', sent: true, knownId: null,
  });
  const manager = new MobileTransferManager(OWNER_A, store, service({}));
  await assert.rejects(() => manager.restore(), /Intención almacenada inválida/);
  assert.equal(data.has(OWNER_A), true);
});

test('T-29: OTP de la API rechazado mantiene la transferencia pendiente y no genera recibo', async () => {
  const pending = { ...transfer, status: 'PENDING_CONFIRMATION' as const, completedAt: null, requiresOtp: true };
  let confirms = 0;
  const { store } = memoryStore();
  const manager = new MobileTransferManager(OWNER_A, store, service({
    send: async () => pending,
    confirm: async () => { confirms++; throw new MobileAuthError(422, 'OTP_INVALID', 'Código incorrecto'); },
  }));
  await manager.begin(form, accounts, [], KEY);
  assert.equal((await manager.submit()).phase, 'otp');
  assert.equal((await manager.confirm('000000')).phase, 'otp');
  assert.equal(confirms, 1);
  assert.equal(manager.state.transfer?.status, 'PENDING_CONFIRMATION');
  assert.equal(manager.state.intent?.key, KEY);
});

test('T-29: red intermitente en confirmación OTP consulta estado sin repetir POST', async () => {
  const pending = { ...transfer, status: 'PENDING_CONFIRMATION' as const, completedAt: null, requiresOtp: true };
  let confirms = 0;
  let gets = 0;
  const { store } = memoryStore();
  const manager = new MobileTransferManager(OWNER_A, store, service({
    send: async () => pending,
    confirm: async () => { confirms++; throw new MobileAuthError(0, 'NETWORK_ERROR', 'Respuesta perdida'); },
    get: async () => { gets++; return transfer; },
  }));
  await manager.begin(form, accounts, [], KEY);
  await manager.submit();
  assert.equal((await manager.confirm('123456')).phase, 'unknown');
  assert.equal((await manager.reconcile()).phase, 'completed');
  assert.equal(confirms, 1);
  assert.equal(gets, 1);
});

test('T-29: consulta autenticada 401 revoca sesión cuando refresh fue invalidado', async () => {
  let refresh = 'refresh-initial';
  let expirationCount = 0;
  const reply: MobileAuthReply = {
    user: { id: OWNER_A, name: 'Demo', email: 'demo@treo.test' },
    accessToken: 'access-expirado', refreshToken: refresh, accessExpiresInSeconds: 60,
  };
  const storage: TokenStorage = {
    read: async () => refresh,
    write: async next => { refresh = next; },
    remove: async () => { refresh = ''; },
  };
  const transport: AuthTransport = {
    login: async () => reply,
    refresh: async () => { throw new MobileAuthError(401, 'REVOKED', 'Token revocado'); },
    logout: async () => {},
  };
  const controller = new MobileAuthController(storage, transport);
  await controller.login({ email: reply.user.email, password: 'synthetic' });
  const fetcher = async () => ({ status: 401, ok: false, json: async () => ({ code: 'UNAUTHORIZED' }) }) as Response;
  const get = createAuthorizedGet(controller, () => { expirationCount++; }, 'http://localhost:3000/api/v1', fetcher as typeof fetch);
  await assert.rejects(get('/accounts'), /sesión ha expirado/);
  assert.equal(refresh, '');
  assert.equal(controller.access, null);
  assert.equal(expirationCount, 1);
});
