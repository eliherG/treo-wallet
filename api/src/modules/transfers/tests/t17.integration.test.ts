import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AtomicTransferService } from '../atomic-transfer.service.js';
import { TransferStatusService } from '../transfer-status.service.js';
import { createTransferStatusRouter } from '../transfer-status.routes.js';

const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const tokens = new AccessTokens('t17-private-integration-secret-material-1234567');
const auth = new AuthService(db, tokens);
const financial = new AtomicTransferService(db);
const status = new TransferStatusService(db);
const users: string[] = [];
const ROLLBACK = Symbol('T17 transaction rollback');
const app = createApp({ logger: pino({ level: 'silent' }),
  registerRoutes(api) { api.use(createTransferStatusRouter(db, tokens)); } });

before(async () => {
  await db.initialize(); await migrator.initialize();
  if (db.options.database !== 'treo_test' || migrator.options.database !== 'treo_test') {
    throw new Error('T-17 tests may only use treo_test');
  }
});
after(async () => {
  try {
    if (users.length) {
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])', [users]);
      await migrator.query('DELETE FROM accounts WHERE user_id = ANY($1::uuid[])', [users]);
      await migrator.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});
async function fixture() {
  const reg = await auth.register({ name: 'Estado de transferencia',
    email: `t17-${randomUUID()}@treo.test`, password: 'T17-PrivatePassword-OnlyForTests123' });
  const id = reg.user.id;
  users.push(id);
  const repo = db.getRepository(AccountEntity);
  const own = await repo.findOneByOrFail({ userId: id });
  const other = await repo.save(repo.create({ userId: id, currency: 'MXN',
    clabe: generateDemoClabe(), balanceCents: '0', status: 'ACTIVE' }));
  await migrator.query('UPDATE accounts SET balance_cents = 1000000 WHERE id = $1', [own.id]);
  return { id, source: own.id, target: other.id, targetClabe: other.clabe };
}
async function rollback(fn: (tx: Parameters<typeof status.getWithManager>[0]) => Promise<void>) {
  await assert.rejects(db.transaction('READ COMMITTED', async tx => {
    await fn(tx); throw ROLLBACK;
  }), error => error === ROLLBACK);
}
function payload(f: Awaited<ReturnType<typeof fixture>>, amount: string) {
  return { sourceAccountId: f.source, destinationAccountId: f.target,
    amount, concept: 'Consulta de comprobante', reference: '0000123' };
}
function isStatus(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error
    && error.status === code;
}

test('T-17: COMPLETED devuelve datos persistidos y CLABE enmascarada', async () => {
  const f = await fixture();
  await rollback(async tx => {
    const done = await financial.submitInTransaction(tx, {
      authenticatedUserId: f.id, idempotencyKey: randomUUID(), payload: payload(f, '120.25'),
    });
    assert.equal(done.outcome, 'COMPLETED');
    if (done.outcome !== 'COMPLETED') throw new Error('Fixture did not complete');
    const receipt = await status.getWithManager(tx, f.id, done.transfer.id);
    assert.deepEqual(receipt, done.transfer);
    assert.equal(receipt.amountCents, '12025');
    assert.equal(receipt.destinationAccountMasked, `${'*'.repeat(14)}${f.targetClabe.slice(-4)}`);
    assert.ok(receipt.completedAt);
    assert.equal(JSON.stringify(receipt).includes(f.targetClabe), false);
  });
});

test('T-17: resultado REJECTED muestra código sin comprobante final', async () => {
  const f = await fixture();
  await rollback(async tx => {
    await tx.query('UPDATE accounts SET balance_cents = 0 WHERE id = $1', [f.source]);
    const error = await financial.submitInTransaction(tx, {
      authenticatedUserId: f.id, idempotencyKey: randomUUID(), payload: payload(f, '100.00'),
    });
    assert.equal(error.outcome, 'ERROR');
    if (error.outcome !== 'ERROR' || !error.transferId) throw new Error('Missing rejected intention');
    const rejected = await status.getWithManager(tx, f.id, error.transferId);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.rejectionCode, 'INSUFFICIENT_FUNDS');
    assert.equal(rejected.completedAt, null);
    assert.equal(rejected.destinationAccountMasked.endsWith(f.targetClabe.slice(-4)), true);
  });
});

test('T-17: PENDING_CONFIRMATION no devuelve comprobante confirmado', async () => {
  const f = await fixture();
  const policy = { mode: 'test' as const, code: '719253',
    secret: 't17-otp-hmac-only-for-tests-1234567890' };
  const otp = new AtomicTransferService(db, policy);
  await rollback(async tx => {
    const pending = await otp.submitInTransaction(tx, {
      authenticatedUserId: f.id, idempotencyKey: randomUUID(), payload: payload(f, '5000.01'),
    });
    assert.equal(pending.outcome, 'PENDING_CONFIRMATION');
    if (pending.outcome !== 'PENDING_CONFIRMATION') throw Error('Missing pending transfer');
    const row = await status.getWithManager(tx, f.id, pending.transfer.id);
    assert.equal(row.status, 'PENDING_CONFIRMATION');
    assert.equal(row.completedAt, null);
  });
});

test('T-17: acceso ajeno y UUID inexistente son indistinguibles (404)', async () => {
  const f = await fixture(); const foreign = await fixture();
  await rollback(async tx => {
    const done = await financial.submitInTransaction(tx, {
      authenticatedUserId: f.id, idempotencyKey: randomUUID(), payload: payload(f, '5.00'),
    });
    assert.equal(done.outcome, 'COMPLETED');
    if (done.outcome !== 'COMPLETED') throw Error('Fixture did not complete');
    await assert.rejects(status.getWithManager(tx, foreign.id, done.transfer.id), err => isStatus(err, 404));
    await assert.rejects(status.getWithManager(tx, foreign.id, randomUUID()), err => isStatus(err, 404));
  });
});

test('T-17 HTTP: auth, UUID inválido y ausente se rechazan RFC 7807', async () => {
  const f = await fixture(); const access = await tokens.issue(f.id);
  await request(app).get(`/api/v1/transfers/${randomUUID()}`).expect(401);
  const bad = await request(app).get('/api/v1/transfers/not-a-uuid')
    .set('Authorization', `Bearer ${access}`).expect(400);
  assert.equal(bad.body.code, 'INVALID_TRANSFER_ID');
  const missing = await request(app).get(`/api/v1/transfers/${randomUUID()}`)
    .set('Authorization', `Bearer ${access}`).expect(404);
  assert.equal(missing.body.code, 'TRANSFER_NOT_FOUND');
});
