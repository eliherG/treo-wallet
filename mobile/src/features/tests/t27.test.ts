import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MobileAuthController, MobileAuthError } from '../../auth/controller';
import type { AuthTransport, MobileAuthReply, TokenStorage } from '../../auth/types';
import { createAuthorizedGet, type AuthorizedGet } from '../../api/authorized-get';
import { loadAccounts } from '../accounts/accounts';
import { formatMxnCents, formatSignedMxnCents } from '../accounts/money';
import { loadRecentMovements } from '../movements/movements';
import { loadBeneficiaries, selectBeneficiary } from '../beneficiaries/beneficiaries';

const demo: MobileAuthReply = {
  user: { id: 'user-a', name: 'Demo A', email: 'a@treo.test' },
  accessToken: 'token-in-memory', refreshToken: 'refresh-only', accessExpiresInSeconds: 900,
};
function setup() {
  let stored: string | null = null;
  let refreshes = 0;
  let revoked = false;
  const storage: TokenStorage = {
    read: async () => stored,
    write: async token => { stored = token; },
    remove: async () => { stored = null; },
  };
  const api: AuthTransport = {
    login: async () => demo,
    refresh: async () => {
      refreshes++;
      if (revoked) throw new MobileAuthError(401, 'INVALID_SESSION', 'Revocada');
      return { ...demo, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' };
    },
    logout: async () => {},
  };
  const controller = new MobileAuthController(storage, api);
  return { controller, getStored: () => stored, getRefreshes: () => refreshes, revoke: () => { revoked = true; } };
}
const ok = (value: object): Response => new Response(JSON.stringify(value), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

test('T-27: formatting cents is exact for zero, fractions and very large balances', () => {
  assert.equal(formatMxnCents('0'), '$0.00');
  assert.equal(formatMxnCents('1'), '$0.01');
  assert.equal(formatMxnCents('1000000'), '$10,000.00');
  assert.equal(formatMxnCents('900719925474099300'), '$9,007,199,254,740,993.00');
  assert.equal(formatSignedMxnCents('-15025'), '−$150.25');
  assert.equal(formatSignedMxnCents('15025'), '+$150.25');
  assert.throws(() => formatMxnCents('1.50'), /Centavos inválidos/);
  assert.throws(() => formatMxnCents('-1'), /Centavos inválidos/);
});

test('T-27: accounts request uses own authorized endpoint and exact cents', async () => {
  let path = '';
  const accounts = await loadAccounts((async <T>(url: string): Promise<T> => {
    path = url;
    return { accounts: [{ id: 'own-a', clabeMasked: '**************1234', currency: 'MXN',
      balanceCents: '1000000', status: 'ACTIVE' }] } as unknown as T;
  }) as AuthorizedGet);
  assert.equal(path, '/accounts');
  assert.equal(accounts[0].balanceCents, '1000000');
  assert.equal(accounts[0].clabeMasked, '**************1234');
});

test('T-27: accounts allow an empty collection and reject malformed payloads', async () => {
  assert.deepEqual(await loadAccounts(async <T>() => ({ accounts: [] }) as unknown as T), []);
  await assert.rejects(() => loadAccounts(async <T>() => ({ accounts: null }) as unknown as T), /inválida/);
});

test('T-27: recent movements request limit=20 and do not fetch cursored history', async () => {
  let path = '';
  const data = await loadRecentMovements(async <T>(url: string) => {
    path = url;
    return { items: Array.from({ length: 20 }, (_, i) => ({ id: `movement-${i}` })), nextCursor: 'private' } as unknown as T;
  });
  assert.equal(path, '/movements?limit=20');
  assert.equal(data.length, 20);
  assert.equal(data[0].id, 'movement-0');
});

test('T-27: movement overflow rejected; empty collection is valid', async () => {
  await assert.rejects(() => loadRecentMovements(async <T>() => ({ items: Array(21).fill({}) }) as unknown as T), /inválida/);
  assert.deepEqual(await loadRecentMovements(async <T>() => ({ items: [], nextCursor: null }) as unknown as T), []);
});

test('T-27: beneficiary retrieval is read-only and selection stays within returned data', async () => {
  let path = '';
  const items = await loadBeneficiaries(async <T>(url: string) => {
    path = url;
    return { beneficiaries: [
      { id: 'benef-a', name: 'Persona A', alias: 'Amigo', clabeMasked: '**************4411', isInternal: true },
      { id: 'benef-b', name: 'Banco B', alias: 'Banco', clabeMasked: '**************6622', isInternal: false },
    ] } as unknown as T;
  });
  assert.equal(path, '/beneficiaries');
  assert.equal(selectBeneficiary(items, 'benef-a')?.alias, 'Amigo');
  assert.equal(selectBeneficiary(items, 'other-user'), null);
  assert.equal(selectBeneficiary(items, 'benef-b')?.isInternal, false);
});

test('T-27: beneficiary collection can be empty', async () => {
  assert.deepEqual(await loadBeneficiaries(async <T>() => ({ beneficiaries: [] }) as unknown as T), []);
});

test('T-27: GET sends bearer from memory and never includes refresh in headers', async () => {
  const x = setup();
  await x.controller.login({ email: 'a@treo.test', password: 'secret' });
  let path = '';
  let authorization = '';
  const get = createAuthorizedGet(x.controller, () => {}, 'http://127.0.0.1:3000/api/v1', (async (url: RequestInfo | URL, init?: RequestInit) => {
    path = String(url);
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    return ok({ accounts: [] });
  }) as typeof fetch);
  assert.deepEqual(await loadAccounts(get), []);
  assert.equal(path, 'http://127.0.0.1:3000/api/v1/accounts');
  assert.equal(authorization, 'Bearer token-in-memory');
  assert.equal(x.getStored(), 'refresh-only');
});

test('T-27: expired access rotates refresh once then retries GET once', async () => {
  const x = setup();
  await x.controller.login({ email: 'a@treo.test', password: 'secret' });
  const observed: string[] = [];
  const get = createAuthorizedGet(x.controller, () => {}, 'http://localhost:3000/api/v1', (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const bearer = new Headers(init?.headers).get('Authorization') ?? '';
    observed.push(bearer);
    if (bearer === 'Bearer token-in-memory') return new Response('{}', { status: 401 });
    return ok({ accounts: [] });
  }) as typeof fetch);
  assert.deepEqual(await loadAccounts(get), []);
  assert.deepEqual(observed, ['Bearer token-in-memory', 'Bearer rotated-access']);
  assert.equal(x.getStored(), 'rotated-refresh');
  assert.equal(x.getRefreshes(), 1);
});

test('T-27: revoked session returns guest and does not perform second GET', async () => {
  const x = setup();
  await x.controller.login({ email: 'a@treo.test', password: 'secret' });
  x.revoke();
  let expired = 0;
  let calls = 0;
  const get = createAuthorizedGet(x.controller, () => { expired++; }, 'http://localhost:3000/api/v1',
    (async () => { calls++; return new Response('{}', { status: 401 }); }) as typeof fetch);
  await assert.rejects(() => loadAccounts(get), /expirado/);
  assert.equal(expired, 1);
  assert.equal(calls, 1);
  assert.equal(x.getStored(), null);
});

test('T-27: network failure does not destroy the session or stored refresh', async () => {
  const x = setup();
  await x.controller.login({ email: 'a@treo.test', password: 'secret' });
  const get = createAuthorizedGet(x.controller, () => {}, 'http://localhost:3000/api/v1',
    (async () => { throw new Error('offline'); }) as typeof fetch);
  await assert.rejects(() => loadAccounts(get), /conectar/);
  assert.equal(x.getStored(), 'refresh-only');
  assert.equal(x.controller.access, 'token-in-memory');
});

test('T-27: server error retains RFC7807 message; malformed success fails', async () => {
  const x = setup();
  await x.controller.login({ email: 'a@treo.test', password: 'secret' });
  const get500 = createAuthorizedGet(x.controller, () => {}, 'http://localhost:3000/api/v1',
    (async () => new Response(JSON.stringify({ detail: 'Fallo temporal', code: 'TEMP' }), { status: 503 })) as typeof fetch);
  await assert.rejects(() => loadAccounts(get500), /Fallo temporal/);
  const getBad = createAuthorizedGet(x.controller, () => {}, 'http://localhost:3000/api/v1',
    (async () => ok({ somethingElse: true })) as typeof fetch);
  await assert.rejects(() => loadAccounts(getBad), /inválida/);
});
