import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { createAuthRouter } from '../../auth/auth.routes.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AccessTokens } from '../../auth/jwt.js';
import { AccountEntity } from '../entities/account.entity.js';
import { createAccountsRouter } from '../accounts.routes.js';

const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const tokens = new AccessTokens('t11-integration-only-jwt-secret-123456789');
const auth = new AuthService(db, tokens);
const password = 'T11-Fixture-Only-Password!123';
const createdUserIds = new Set<string>();
const app = createApp({
  logger: pino({ level: 'silent' }),
  registerRoutes(router) {
    router.use(createAuthRouter(auth));
    router.use(createAccountsRouter(db, tokens));
  },
});

type Registered = {
  userId: string;
  accessToken: string;
  originalAccount: AccountEntity;
};

before(async () => {
  await db.initialize();
  await migrator.initialize();
});

after(async () => {
  try {
    if (createdUserIds.size && migrator.isInitialized) {
      const ids = [...createdUserIds];
      // Test data only. No financial ledger entries are created by this suite.
      await migrator.query('DELETE FROM "refresh_tokens" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "accounts" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function fixture(tag: string): Promise<Registered> {
  const email = `${tag}-${randomUUID()}@treo.test`;
  const registered = await request(app).post('/api/v1/auth/register')
    .send({ name: 'Persona T11', email, password }).expect(201);
  const userId = registered.body.user.id as string;
  createdUserIds.add(userId);
  const login = await request(app).post('/api/v1/auth/login')
    .send({ email, password, client: 'MOBILE' }).expect(200);
  const accounts = await db.getRepository(AccountEntity).findBy({ userId });
  assert.equal(accounts.length, 1);
  return { userId, accessToken: login.body.accessToken as string, originalAccount: accounts[0]! };
}

function getAccounts(accessToken: string) {
  return request(app).get('/api/v1/accounts').set('Authorization', `Bearer ${accessToken}`);
}

test('T-11: registro normal devuelve una cuenta demo con saldo string, moneda y CLABE enmascarada', async () => {
  const user = await fixture('one');
  const response = await getAccounts(user.accessToken).expect(200);
  assert.equal(response.headers['content-type']?.startsWith('application/json'), true);
  assert.equal(response.headers['x-request-id']?.length, 36);
  assert.deepEqual(Object.keys(response.body), ['accounts']);
  assert.equal(response.body.accounts.length, 1);
  const account = response.body.accounts[0];
  assert.deepEqual(Object.keys(account).sort(),
    ['id', 'clabeMasked', 'currency', 'balanceCents', 'status'].sort());
  assert.equal(account.id, user.originalAccount.id);
  assert.equal(account.currency, 'MXN');
  assert.equal(account.status, 'ACTIVE');
  assert.equal(account.balanceCents, '0');
  assert.equal(typeof account.balanceCents, 'string');
  assert.equal(account.clabeMasked, `${'*'.repeat(14)}${user.originalAccount.clabe.slice(-4)}`);
  assert.equal(JSON.stringify(response.body).includes(user.originalAccount.clabe), false);
  assert.equal(JSON.stringify(response.body).includes(user.userId), false);
});

test('T-11: un usuario sin cuentas obtiene 200 y arreglo vacío', async () => {
  const user = await fixture('none');
  // This empty state exists only in the test fixture; registration normally creates one account.
  await migrator.query('DELETE FROM "accounts" WHERE id = $1', [user.originalAccount.id]);
  const response = await getAccounts(user.accessToken).expect(200);
  assert.deepEqual(response.body, { accounts: [] });
});

test('T-11: varias cuentas conservan saldos BIGINT exactos y estado BLOCKED', async () => {
  const user = await fixture('many');
  // Test-only persisted balances, not simulated deposits or real transactions.
  const preciseBalance = '9007199254740993';
  const other = await db.getRepository(AccountEntity).save(db.getRepository(AccountEntity).create({
    userId: user.userId,
    clabe: generateDemoClabe(),
    currency: 'MXN',
    status: 'BLOCKED',
    balanceCents: preciseBalance,
  }));
  const response = await getAccounts(user.accessToken).expect(200);
  assert.equal(response.body.accounts.length, 2);
  const ownIds = response.body.accounts.map((account: { id: string }) => account.id).sort();
  assert.deepEqual(ownIds, [user.originalAccount.id, other.id].sort());
  const block = response.body.accounts.find((account: { id: string }) => account.id === other.id);
  assert.equal(block?.balanceCents, preciseBalance);
  assert.equal(typeof block?.balanceCents, 'string');
  assert.equal(block?.status, 'BLOCKED');
  assert.equal(block?.clabeMasked, `${'*'.repeat(14)}${other.clabe.slice(-4)}`);
  assert.equal(JSON.stringify(response.body).includes(other.clabe), false);
});

test('T-11: la consulta siempre usa el propietario del JWT e ignora identificadores ajenos', async () => {
  const a = await fixture('owner-a');
  const b = await fixture('owner-b');
  const first = await getAccounts(a.accessToken).query({ userId: b.userId }).expect(200);
  const second = await getAccounts(b.accessToken).expect(200);
  assert.deepEqual(first.body.accounts.map((account: { id: string }) => account.id),
    [a.originalAccount.id]);
  assert.deepEqual(second.body.accounts.map((account: { id: string }) => account.id),
    [b.originalAccount.id]);
  assert.equal(JSON.stringify(first.body).includes(b.originalAccount.id), false);
  assert.equal(JSON.stringify(first.body).includes(b.originalAccount.clabe), false);
});

test('T-11: respuesta refleja el saldo materializado más reciente sin convertirlo a number', async () => {
  const user = await fixture('updated');
  const before = await getAccounts(user.accessToken).expect(200);
  assert.equal(before.body.accounts[0]?.balanceCents, '0');
  // Fixture: direct test-only update, not a transfer. Real transfer invariants are tested in T-15.
  const balance = '123456789012345';
  await db.getRepository(AccountEntity).update({ id: user.originalAccount.id }, { balanceCents: balance });
  const afterResult = await getAccounts(user.accessToken).expect(200);
  assert.equal(afterResult.body.accounts[0]?.balanceCents, balance);
});

test('T-11: Bearer ausente, manipulado y usuario inexistente producen 401 RFC 7807', async () => {
  await request(app).get('/api/v1/accounts').expect(401).then((res) => {
    assert.equal(res.body.code, 'UNAUTHORIZED');
    assert.equal(res.headers['content-type']?.startsWith('application/problem+json'), true);
    assert.equal(res.body.requestId, res.headers['x-request-id']);
  });
  const registered = await fixture('invalid-jwt');
  await getAccounts(`${registered.accessToken}modified`).expect(401);
  await getAccounts(await tokens.issue(randomUUID())).expect(401);
});
