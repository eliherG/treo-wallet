import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import type { ResolvedTransferIntent } from '../idempotency.js';
import { TransferIntentService } from '../intent-service.js';

// Explicitly NEVER use the development database in this suite.
const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const auth = new AuthService(db, new AccessTokens('t14-integration-only-secret-1234567890'));
const service = new TransferIntentService(db);
const createdUserIds = new Set<string>();

type Fixture = { userId: string; from: string; to: string };

before(async () => {
  await db.initialize();
  await migrator.initialize();
  if (db.options.database === migrator.options.database &&
      typeof db.options.database === 'string' && db.options.database.includes('test')) return;
  throw new Error('T-14 integration only supports treo_test');
});

after(async () => {
  try {
    if (createdUserIds.size && migrator.isInitialized) {
      const ids = [...createdUserIds];
      // PROCESSING only, no ledger, no daily usage, no OTP or audit created.
      await migrator.query('DELETE FROM transfers WHERE sender_user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM accounts WHERE user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function fixture(label: string): Promise<Fixture> {
  const email = `t14-${label}-${randomUUID()}@treo.test`;
  const registered = await auth.register({ name: 'Prueba Idempotencia', email,
    password: 'T14-TestOnlyPassword-123!' });
  const userId = registered.user.id;
  createdUserIds.add(userId);
  const first = await db.getRepository(AccountEntity).findOneByOrFail({ userId });
  const second = await db.getRepository(AccountEntity).save(db.getRepository(AccountEntity).create({
    userId, clabe: generateDemoClabe(), currency: 'MXN', balanceCents: '0', status: 'ACTIVE',
  }));
  return { userId, from: first.id, to: second.id };
}

function entry(f: Fixture, key: string, changes: Partial<Pick<ResolvedTransferIntent, 'amountCents' | 'concept' | 'reference' | 'sourceAccountId'>> = {}) {
  const instruction: ResolvedTransferIntent = {
    kind: 'OWN_ACCOUNTS', sourceAccountId: f.from, destinationAccountId: f.to,
    amountCents: 12_345n, concept: 'Abono', reference: '0001234',
    ...changes,
  };
  return { authenticatedUserId: f.userId, idempotencyKey: key, instruction };
}

async function rowsFor(f: Fixture, key: string) {
  return db.query('SELECT id, status, payload_hash FROM transfers WHERE sender_user_id = $1 AND idempotency_key = $2',
    [f.userId, key]) as Promise<Array<{ id: string; status: string; payload_hash: string }>>;
}

test('T-14: primera solicitud crea PROCESSING; replay recupera mismo ID y hash', async () => {
  const f = await fixture('single');
  const key = randomUUID();
  const first = await service.register(entry(f, key));
  const second = await service.register(entry(f, key));
  assert.equal(first.disposition, 'CREATED');
  assert.equal(second.disposition, 'REPLAYED');
  assert.equal(first.transferId, second.transferId);
  assert.equal(first.status, 'PROCESSING');
  assert.equal((await rowsFor(f, key)).length, 1);
});

test('T-14: concurrencia misma llave y payload deja una sola intención', async () => {
  const f = await fixture('parallel');
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 10 }, () => service.register(entry(f, key))));
  assert.equal(new Set(results.map((x) => x.transferId)).size, 1);
  assert.equal(results.filter((x) => x.disposition === 'CREATED').length, 1);
  assert.equal((await rowsFor(f, key)).length, 1);
});

test('T-14: misma llave y distinta intención se rechaza 409 sin cambiar fila', async () => {
  const f = await fixture('conflict');
  const key = randomUUID();
  const initial = await service.register(entry(f, key));
  await assert.rejects(service.register(entry(f, key, { amountCents: 12_346n })),
    (err: unknown) => Boolean(err && typeof err === 'object' && 'status' in err && err.status === 409));
  const rows = await rowsFor(f, key);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, initial.transferId);
  assert.equal(await service.register(entry(f, key)).then((x) => x.transferId), initial.transferId);
});

test('T-14: mismo valor de llave funciona en dos usuarios distintos', async () => {
  const f1 = await fixture('owner-one');
  const f2 = await fixture('owner-two');
  const key = randomUUID();
  const [a, b] = await Promise.all([service.register(entry(f1, key)), service.register(entry(f2, key))]);
  assert.notEqual(a.transferId, b.transferId);
  assert.equal((await rowsFor(f1, key)).length, 1);
  assert.equal((await rowsFor(f2, key)).length, 1);
});

test('T-14: excepción antes de commit revierte la intención por completo', async () => {
  const f = await fixture('rollback');
  const key = randomUUID();
  await assert.rejects(db.transaction('READ COMMITTED', async (tx) => {
    await service.registerInTransaction(tx, entry(f, key));
    throw new Error('T14 controlled rollback');
  }), /T14 controlled rollback/);
  assert.equal((await rowsFor(f, key)).length, 0);
  const retry = await service.register(entry(f, key));
  assert.equal(retry.disposition, 'CREATED');
  assert.equal((await rowsFor(f, key)).length, 1);
});

test('T-14: claves y actor inválidos fallan sin persistir ni hacer consultas', async () => {
  const f = await fixture('invalid');
  await assert.rejects(service.register(entry(f, 'short')), RangeError);
  await assert.rejects(service.register({ ...entry(f, randomUUID()), authenticatedUserId: 'invalid' }), RangeError);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM transfers WHERE sender_user_id = $1',
    [f.userId]) as Array<{count: number}>)[0]?.count, 0);
});

test('T-14: OTP solo se marca cuando importe supera estrictamente 500000 centavos', async () => {
  const f = await fixture('otpflag');
  const exact = await service.register(entry(f, randomUUID(), { amountCents: 500_000n }));
  const over = await service.register(entry(f, randomUUID(), { amountCents: 500_001n }));
  assert.equal(exact.requiresOtp, false);
  assert.equal(over.requiresOtp, true);
  assert.equal(exact.status, 'PROCESSING');
  assert.equal(over.status, 'PROCESSING');
});
