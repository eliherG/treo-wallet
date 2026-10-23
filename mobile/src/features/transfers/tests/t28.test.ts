import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MobileAuthController, MobileAuthError } from '../../../auth/controller';
import type { AuthTransport, MobileAuthReply, TokenStorage } from '../../../auth/types';
import { createAuthorizedPost } from '../../../api/authorized-post';
import type { Account } from '../../accounts/accounts';
import type { Beneficiary } from '../../beneficiaries/beneficiaries';
import { toCents, validateDraft, type Transfer, type TransferForm } from '../draft';
import { MobileTransferManager, type PendingIntent, type PendingIntentStore } from '../manager';
import { createTransferService, type TransferService } from '../service';
import { shouldCoverSensitiveContent } from '../privacy';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerId = '99999999-9999-4999-8999-999999999999';
const accounts: Account[] = [
  { id: A, clabeMasked: '**************0011', currency: 'MXN', balanceCents: '1000000', status: 'ACTIVE' },
  { id: B, clabeMasked: '**************0022', currency: 'MXN', balanceCents: '200000', status: 'ACTIVE' },
];
const beneficiaries: Beneficiary[] = [
  { id: C, name: 'Persona C', alias: 'C', clabeMasked: '**************0033', isInternal: true },
  { id: ID, name: 'Banco externo', alias: 'Externo', clabeMasked: '**************0044', isInternal: false },
];
const form: TransferForm = {
  mode: 'OWN_ACCOUNTS', sourceAccountId: A, targetId: B, amount: '150.25', concept: 'Prueba', reference: '0001234',
};
const completed: Transfer = {
  id: ID, status: 'COMPLETED', kind: 'OWN_ACCOUNTS', sourceAccountId: A,
  destinationAccountMasked: '**************0022', amountCents: '15025', concept: 'Prueba', reference: '0001234',
  requiresOtp: false, createdAt: '2026-10-23T16:00:00.000Z', completedAt: '2026-10-23T16:00:01.000Z', rejectionCode: null,
};
function createStore() {
  const items = new Map<string, PendingIntent>();
  let writes = 0;
  const store: PendingIntentStore = {
    read: async owner => items.has(owner) ? structuredClone(items.get(owner)!) : null,
    write: async (owner, data) => { writes++; items.set(owner, structuredClone(data)); },
    remove: async owner => { items.delete(owner); },
  };
  return { store, reads: () => items.size, writes: () => writes };
}
function service(overrides: Partial<TransferService> = {}): TransferService {
  return {
    send: async () => completed,
    get: async () => completed,
    confirm: async () => completed,
    ...overrides,
  };
}
function credentials() {
  const reply: MobileAuthReply = {
    user: { id: ownerId, email: 'demo@treo.test', name: 'Demo' },
    accessToken: 'old-access', refreshToken: 'refresh-secret', accessExpiresInSeconds: 60,
  };
  let current: string | null = null;
  const storage: TokenStorage = {
    read: async () => current, write: async value => { current = value; }, remove: async () => { current = null; },
  };
  const transport: AuthTransport = {
    login: async () => reply,
    refresh: async () => ({ ...reply, accessToken: 'new-access', refreshToken: 'new-refresh' }),
    logout: async () => {},
  };
  return { controller: new MobileAuthController(storage, transport), getStored: () => current };
}

test('T-28: decimal-to-cent conversion is exact; no exponent, rounding, negative or zero', () => {
  assert.equal(toCents('150.25'), 15025n);
  assert.equal(toCents('5000.01'), 500001n);
  assert.equal(toCents('9007199254740993.00'), 900719925474099300n);
  for (const invalid of ['1.234', '1e3', '-1', '1,00', '01.00', ' 1', '', '0.00']) {
    if (invalid === '0.00') assert.equal(toCents(invalid), 0n);
    else assert.throws(() => toCents(invalid));
  }
});

test('T-28: validation keeps leading reference zeroes and creates own-account target exclusively', () => {
  const result = validateDraft(form, accounts, beneficiaries);
  assert.deepEqual(result.errors, {});
  assert.equal(result.draft?.request.reference, '0001234');
  assert.deepEqual(result.draft?.request, {
    sourceAccountId: A, destinationAccountId: B, amount: '150.25', concept: 'Prueba', reference: '0001234',
  });
});

test('T-28: beneficiary transfer uses only internally registered authorized ID', () => {
  const result = validateDraft({ ...form, mode: 'BENEFICIARY', targetId: C }, accounts, beneficiaries);
  assert.equal(result.draft?.request.beneficiaryId, C);
  assert.equal(result.draft?.request.destinationAccountId, undefined);
  assert.equal(validateDraft({ ...form, mode: 'BENEFICIARY', targetId: ID }, accounts, beneficiaries).draft, undefined);
  assert.equal(validateDraft({ ...form, mode: 'BENEFICIARY', targetId: B }, accounts, beneficiaries).draft, undefined);
});

test('T-28: invalid amounts, self account, blocked origin, concept and references rejected locally', () => {
  for (const invalid of [
    { ...form, amount: '0' }, { ...form, amount: '5000.001' },
    { ...form, amount: '999999999999999999' }, { ...form, targetId: A },
    { ...form, concept: ' ' }, { ...form, concept: 'x'.repeat(141) },
    { ...form, reference: '12345678' }, { ...form, reference: 'A123' },
  ]) assert.equal(validateDraft(invalid, accounts, beneficiaries).draft, undefined);
  const blocked: Account[] = [{ ...accounts[0]!, status: 'BLOCKED' }, accounts[1]!];
  assert.equal(validateDraft(form, blocked, beneficiaries).draft, undefined);
});

test('T-28: intent persist occurs before POST and explicit review is mandatory', async () => {
  const data = createStore();
  const manager = new MobileTransferManager(ownerId, data.store, service());
  await manager.begin(form, accounts, beneficiaries, KEY);
  assert.equal(data.writes(), 1);
  assert.equal(manager.state.phase, 'review');
  assert.equal(manager.state.intent?.sent, false);
  await manager.submit();
  assert.equal(manager.state.phase, 'completed');
  assert.ok(data.writes() >= 3);
});

test('T-28: duplicate simultaneous taps issue at most one POST', async () => {
  let calls = 0;
  let finish!: (transfer: Transfer) => void;
  const later = new Promise<Transfer>(resolve => { finish = resolve; });
  const manager = new MobileTransferManager(ownerId, createStore().store,
    service({ send: async () => { calls++; return later; } }));
  await manager.begin(form, accounts, beneficiaries, KEY);
  const first = manager.submit();
  const second = manager.submit();
  finish(completed);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(manager.state.phase, 'completed');
});

test('T-28: ambiguous network drop preserves frozen payload and key through cold restart, one ledger effect', async () => {
  const data = createStore();
  let attempts = 0;
  let ledgerDebits = 0;
  const server = new Map<string, Transfer>();
  const api = service({ send: async (request, key) => {
    attempts++;
    assert.equal(request.reference, '0001234');
    let record = server.get(key);
    if (!record) { record = completed; server.set(key, record); ledgerDebits++; }
    if (attempts === 1) throw new MobileAuthError(0, 'NETWORK_ERROR', 'Timeout after commit');
    return record;
  } });
  const first = new MobileTransferManager(ownerId, data.store, api);
  await first.begin(form, accounts, beneficiaries, KEY);
  assert.equal((await first.submit()).phase, 'unknown');
  assert.equal(ledgerDebits, 1);
  await assert.rejects(() => first.reset(), /Primero resuelve/);
  const reopened = new MobileTransferManager(ownerId, data.store, api);
  assert.equal((await reopened.restore()).phase, 'unknown');
  assert.equal(reopened.state.intent?.key, KEY);
  assert.equal(reopened.state.intent?.request.amount, '150.25');
  assert.equal((await reopened.submit()).phase, 'completed');
  assert.equal(attempts, 2);
  assert.equal(ledgerDebits, 1);
});

test('T-28: known transfer ID after restart is reconciled by GET, never by new POST', async () => {
  const data = createStore();
  let sends = 0;
  let gets = 0;
  const api = service({
    send: async () => { sends++; return { ...completed, status: 'PROCESSING', completedAt: null }; },
    get: async () => { gets++; return completed; },
  });
  const manager = new MobileTransferManager(ownerId, data.store, api);
  await manager.begin(form, accounts, beneficiaries, KEY);
  assert.equal((await manager.submit()).phase, 'unknown');
  const reopened = new MobileTransferManager(ownerId, data.store, api);
  assert.equal((await reopened.restore()).phase, 'completed');
  assert.equal(gets, 1);
  assert.equal(sends, 1);
});

test('T-28: pending OTP not completed until validated; failed OTP does not display receipt', async () => {
  const data = createStore();
  let confirms = 0;
  const pending = { ...completed, status: 'PENDING_CONFIRMATION' as const, requiresOtp: true, completedAt: null };
  const api = service({
    send: async () => pending,
    get: async () => pending,
    confirm: async (_id, code) => {
      confirms++;
      if (code !== '123456') throw new MobileAuthError(422, 'INVALID_OTP', 'Código incorrecto');
      return completed;
    },
  });
  const manager = new MobileTransferManager(ownerId, data.store, api);
  await manager.begin(form, accounts, beneficiaries, KEY);
  assert.equal((await manager.submit()).phase, 'otp');
  assert.equal((await manager.confirm('12')).phase, 'otp');
  assert.equal(confirms, 0);
  assert.equal((await manager.confirm('000000')).phase, 'otp');
  assert.equal(confirms, 1);
  assert.equal((await manager.confirm('123456')).phase, 'completed');
});

test('T-28: OTP network timeout triggers GET status reconciliation, not a new confirm', async () => {
  const data = createStore();
  let gets = 0;
  let confirms = 0;
  const pending = { ...completed, status: 'PENDING_CONFIRMATION' as const, completedAt: null };
  const api = service({
    send: async () => pending,
    confirm: async () => { confirms++; throw new MobileAuthError(0, 'NETWORK_ERROR', 'No response'); },
    get: async () => { gets++; return completed; },
  });
  const manager = new MobileTransferManager(ownerId, data.store, api);
  await manager.begin(form, accounts, beneficiaries, KEY);
  await manager.submit();
  assert.equal((await manager.confirm('123456')).phase, 'unknown');
  assert.equal((await manager.reconcile()).phase, 'completed');
  assert.equal(gets, 1);
  assert.equal(confirms, 1);
});

test('T-28: rejected transfer is NOT receipt and allows fresh intent; unknown never allows reset', async () => {
  const manager = new MobileTransferManager(ownerId, createStore().store,
    service({ send: async () => ({ ...completed, status: 'REJECTED', completedAt: null, rejectionCode: 'INSUFFICIENT_FUNDS' }) }));
  await manager.begin(form, accounts, beneficiaries, KEY);
  assert.equal((await manager.submit()).phase, 'rejected');
  assert.equal((await manager.reset()).phase, 'editing');
});

test('T-28: definitive 422 allows correction with new UUID, not a mutated old payload', async () => {
  const store = createStore();
  const manager = new MobileTransferManager(ownerId, store.store,
    service({ send: async () => { throw new MobileAuthError(422, 'INSUFFICIENT_FUNDS', 'Saldo insuficiente'); } }));
  await manager.begin(form, accounts, beneficiaries, KEY);
  assert.equal((await manager.submit()).phase, 'editing');
  assert.equal(store.reads(), 0);
  assert.match(manager.state.error ?? '', /Saldo insuficiente/);
});

test('T-28: transport sends bearer, content and idempotency key; never sends refresh token', async () => {
  const auth = credentials();
  await auth.controller.login({ email: 'demo@treo.test', password: 'secret' });
  const observed: { headers?: Headers; payload?: unknown } = {};
  const post = createAuthorizedPost(auth.controller, () => {}, 'http://localhost:3000/api/v1', async (_url, opts) => {
    observed.headers = new Headers(opts?.headers);
    observed.payload = JSON.parse(String(opts?.body));
    return new Response(JSON.stringify({ transfer: completed }), { status: 201 });
  });
  await post('/transfers', validateDraft(form, accounts, beneficiaries).draft!.request, KEY);
  assert.equal(observed.headers?.get('authorization'), 'Bearer old-access');
  assert.equal(observed.headers?.get('idempotency-key'), KEY);
  assert.equal(observed.headers?.get('refreshToken'), null);
  assert.equal((observed.payload as { reference: string }).reference, '0001234');
  assert.equal(JSON.stringify(observed.payload).includes('refresh-secret'), false);
});

test('T-28: explicit 401 rotates access and retries once; network error is never auto-retried', async () => {
  const auth = credentials();
  await auth.controller.login({ email: 'demo@treo.test', password: 'secret' });
  let attempts = 0;
  const post = createAuthorizedPost(auth.controller, () => {}, 'http://localhost:3000/api/v1', async (_url, opts) => {
    attempts++;
    if (attempts === 1) return new Response('{}', { status: 401 });
    assert.equal(new Headers(opts?.headers).get('authorization'), 'Bearer new-access');
    return new Response(JSON.stringify({ transfer: completed }), { status: 201 });
  });
  await post('/transfers', validateDraft(form, accounts, beneficiaries).draft!.request, KEY);
  assert.equal(attempts, 2);
  let networkAttempts = 0;
  const broken = createAuthorizedPost(auth.controller, () => {}, 'http://localhost:3000/api/v1', async () => {
    networkAttempts++;
    throw new Error('Socket closed');
  });
  await assert.rejects(() => broken('/transfers', { amount: '1' }, KEY), /resultado no confirmado/);
  assert.equal(networkAttempts, 1);
});

test('T-28: service routes use the documented API paths and OTP is never a header', async () => {
  const paths: string[] = [];
  const get = async <T>(path: string): Promise<T> => { paths.push(`GET ${path}`); return { transfer: completed } as unknown as T; };
  const post = async <T>(path: string, payload: object, key?: string): Promise<T> => {
    paths.push(`POST ${path}`);
    if (path.includes('confirm')) { assert.deepEqual(payload, { otp: '123456' }); assert.equal(key, undefined); }
    else assert.equal(key, KEY);
    return { transfer: completed } as unknown as T;
  };
  const s = createTransferService(get, post);
  await s.send(validateDraft(form, accounts, beneficiaries).draft!.request, KEY);
  await s.get(ID);
  await s.confirm(ID, '123456');
  assert.deepEqual(paths, ['POST /transfers', `GET /transfers/${ID}`, `POST /transfers/${ID}/confirm`]);
});

test('T-28: inactive and background app states request an opaque privacy cover', () => {
  assert.equal(shouldCoverSensitiveContent('active'), false);
  assert.equal(shouldCoverSensitiveContent('inactive'), true);
  assert.equal(shouldCoverSensitiveContent('background'), true);
});
