import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { createAuthRouter } from '../../auth/auth.routes.js';
import { AccessTokens } from '../../auth/jwt.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { createBeneficiariesRouter } from '../beneficiaries.routes.js';
import { clabeCheckDigit } from '../clabe.js';

const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const tokens = new AccessTokens('t12-integration-jwt-secret-123456789abcdef');
const auth = new AuthService(db, tokens);
const password = 'T12-Fixture-Only-Password!123';
const createdUserIds = new Set<string>();
const app = createApp({
  logger: pino({ level: 'silent' }),
  registerRoutes(router) {
    router.use(createAuthRouter(auth));
    router.use(createBeneficiariesRouter(db, tokens));
  },
});

type Fixture = { userId: string; accessToken: string; accountClabe: string };

before(async () => {
  await db.initialize();
  await migrator.initialize();
});

after(async () => {
  try {
    if (createdUserIds.size > 0 && migrator.isInitialized) {
      const ids = [...createdUserIds];
      // Test data only: this suite does not create ledger entries or audit rows.
      await migrator.query('DELETE FROM "beneficiaries" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "refresh_tokens" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "accounts" WHERE "user_id" = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM "users" WHERE "id" = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function fixture(label: string): Promise<Fixture> {
  const email = `${label}-${randomUUID()}@treo.test`;
  const registration = await request(app).post('/api/v1/auth/register')
    .send({ name: 'Persona Beneficiaria', email, password }).expect(201);
  const userId = registration.body.user.id as string;
  createdUserIds.add(userId);
  const login = await request(app).post('/api/v1/auth/login')
    .send({ email, password, client: 'MOBILE' }).expect(200);
  const account = await db.getRepository(AccountEntity).findOneByOrFail({ userId });
  return { userId, accessToken: login.body.accessToken as string, accountClabe: account.clabe };
}

function clabeFromPrefix(first17: string): string {
  return `${first17}${clabeCheckDigit(first17)}`;
}

function list(accessToken: string) {
  return request(app).get('/api/v1/beneficiaries').set('Authorization', `Bearer ${accessToken}`);
}

function create(accessToken: string, payload: Record<string, unknown>) {
  return request(app).post('/api/v1/beneficiaries')
    .set('Authorization', `Bearer ${accessToken}`).send(payload);
}

test('T-12: GET propio vacío responde 200 y no filtra datos', async () => {
  const owner = await fixture('empty');
  const res = await list(owner.accessToken).expect(200);
  assert.deepEqual(res.body, { beneficiaries: [] });
  assert.equal(res.headers['x-request-id']?.length, 36);
});

test('T-12: POST de CLABE interna responde 201 con máscara e isInternal true', async () => {
  const owner = await fixture('sender-internal');
  const recipient = await fixture('recipient-internal');
  const res = await create(owner.accessToken, {
    name: '  Receptor  ', alias: '  Amigo  ', clabe: recipient.accountClabe,
  }).expect(201);
  assert.deepEqual(Object.keys(res.body).sort(), ['id', 'name', 'alias', 'clabeMasked', 'isInternal'].sort());
  assert.match(res.body.id, /^[0-9a-f-]{36}$/);
  assert.equal(res.body.name, 'Receptor');
  assert.equal(res.body.alias, 'Amigo');
  assert.equal(res.body.clabeMasked, `**************${recipient.accountClabe.slice(-4)}`);
  assert.equal(res.body.isInternal, true);
  assert.equal(JSON.stringify(res.body).includes(recipient.accountClabe), false);
  assert.equal(JSON.stringify(res.body).includes(owner.userId), false);
  const stored = await db.query('SELECT user_id, clabe FROM beneficiaries WHERE id = $1', [res.body.id]) as Array<{
    user_id: string; clabe: string;
  }>;
  assert.equal(stored[0]?.user_id, owner.userId);
  assert.equal(stored[0]?.clabe, recipient.accountClabe);
});

test('T-12: CLABE externa con checksum válido puede guardarse, pero isInternal false', async () => {
  const owner = await fixture('external');
  const externalClabe = clabeFromPrefix('98765432109876543');
  const created = await create(owner.accessToken,
    { name: 'Cuenta externa', alias: 'Externa', clabe: externalClabe }).expect(201);
  assert.equal(created.body.isInternal, false);
  const listed = await list(owner.accessToken).expect(200);
  assert.equal(listed.body.beneficiaries.length, 1);
  assert.equal(listed.body.beneficiaries[0].isInternal, false);
  assert.equal(JSON.stringify(listed.body).includes(externalClabe), false);
});

test('T-12: unicidad de CLABE por propietario funciona con dos POST concurrentes', async () => {
  const owner = await fixture('duplicate');
  const clabe = clabeFromPrefix('98765432109876544');
  const payload = { name: 'Cuenta A', alias: 'Test', clabe };
  const results = await Promise.all([
    create(owner.accessToken, payload), create(owner.accessToken, payload),
  ]);
  assert.deepEqual(results.map((res) => res.status).sort(), [201, 409]);
  const conflict = results.find((res) => res.status === 409);
  assert.equal(conflict?.body.code, 'BENEFICIARY_ALREADY_EXISTS');
  assert.equal(conflict?.headers['content-type']?.startsWith('application/problem+json'), true);
  assert.equal(JSON.stringify(conflict?.body).includes(clabe), false);
  const listed = await list(owner.accessToken).expect(200);
  assert.equal(listed.body.beneficiaries.length, 1);
});

test('T-12: cada usuario administra su propia lista y la misma CLABE puede repetirse entre propietarios', async () => {
  const ownerA = await fixture('owner-a');
  const ownerB = await fixture('owner-b');
  const clabeA = clabeFromPrefix('98765432109876545');
  const clabeB = clabeFromPrefix('98765432109876546');
  const addedA = await create(ownerA.accessToken,
    { name: 'Solo A', alias: 'A', clabe: clabeA }).expect(201);
  await create(ownerB.accessToken, { name: 'Solo B', alias: 'B', clabe: clabeB }).expect(201);
  const secondOwnerSameClabe = await create(ownerB.accessToken,
    { name: 'Compartido', alias: 'C', clabe: clabeA }).expect(201);
  const responseA = await list(ownerA.accessToken).query({ userId: ownerB.userId }).expect(200);
  const responseB = await list(ownerB.accessToken).expect(200);
  assert.deepEqual(responseA.body.beneficiaries.map((item: { id: string }) => item.id), [addedA.body.id]);
  assert.equal(responseB.body.beneficiaries.length, 2);
  assert.equal(responseB.body.beneficiaries.some((item: { id: string }) => item.id === secondOwnerSameClabe.body.id), true);
  assert.equal(JSON.stringify(responseA.body).includes('Solo B'), false);
  assert.equal(JSON.stringify(responseA.body).includes(ownerB.userId), false);
});

test('T-12: Zod rechaza checksum, longitud, letras, nombres vacíos y propiedades extra', async () => {
  const owner = await fixture('invalid');
  const good = '002180032240946700';
  const bad: Record<string, unknown>[] = [
    { name: 'Persona', alias: 'P', clabe: good.slice(0, -1) },
    { name: 'Persona', alias: 'P', clabe: `${good}1` },
    { name: 'Persona', alias: 'P', clabe: `${good.slice(0, -1)}9` },
    { name: 'Persona', alias: 'P', clabe: `${good.slice(0, -1)}X` },
    { name: ' ', alias: 'P', clabe: good },
    { name: 'Persona', alias: ' ', clabe: good },
    { name: 'Persona', alias: 'P', clabe: good, userId: randomUUID() },
  ];
  for (const payload of bad) {
    const res = await create(owner.accessToken, payload).expect(400);
    assert.equal(res.body.code, 'INVALID_REQUEST');
    assert.equal(res.headers['content-type']?.startsWith('application/problem+json'), true);
    assert.equal(JSON.stringify(res.body).includes(good), false);
  }
  assert.deepEqual((await list(owner.accessToken).expect(200)).body, { beneficiaries: [] });
});

test('T-12: GET y POST requieren JWT verificado; no se expone la lista ajena', async () => {
  const owner = await fixture('auth-required');
  const payload = { name: 'Cuenta', alias: 'C', clabe: clabeFromPrefix('98765432109876547') };
  const missing = await request(app).get('/api/v1/beneficiaries').expect(401);
  assert.equal(missing.body.code, 'UNAUTHORIZED');
  await request(app).post('/api/v1/beneficiaries').send(payload).expect(401);
  await list(`${owner.accessToken}tampered`).expect(401);
  await create(await tokens.issue(randomUUID()), payload).expect(401);
  assert.deepEqual((await list(owner.accessToken).expect(200)).body, { beneficiaries: [] });
});
