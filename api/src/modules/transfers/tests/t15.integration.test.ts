import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../../app.js';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { createAuthRouter } from '../../auth/auth.routes.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { BeneficiaryEntity } from '../../beneficiaries/entities/beneficiary.entity.js';
import { AtomicTransferService, type SubmitTransferInput } from '../atomic-transfer.service.js';
import { createTransfersRouter } from '../transfers.routes.js';

// Never use the development DB. Terminal transfers and immutable ledger/audit
// are exercised inside rollback-only test transactions: fixtures remain clean.
const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const tokens = new AccessTokens('t15-test-only-access-secret-abcdefghijklmnopqrst');
const auth = new AuthService(db, tokens);
const service = new AtomicTransferService(db);
const users = new Set<string>();
const ROLLBACK = Symbol('rollback verified financial transaction');
const logger = pino({ level: 'silent' });
const app = createApp({ logger, registerRoutes(router) {
  router.use(createAuthRouter(auth));
  router.use(createTransfersRouter(db, tokens));
} });

type Fixture = { userId: string; sourceId: string; destinationId: string; destinationClabe: string };

before(async () => {
  await db.initialize();
  await migrator.initialize();
  const name = db.options.database;
  if (name !== migrator.options.database || typeof name !== 'string' || !name.includes('test')) {
    throw new Error('T-15 tests require treo_test and never permit development DB');
  }
});
after(async () => {
  try {
    if (users.size && migrator.isInitialized) {
      const ids = [...users];
      // All financial rows were rolled back by design; no DELETE ever runs on
      // ledger_entries or audit_events (both protected by T-06).
      await migrator.query('DELETE FROM beneficiaries WHERE user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM accounts WHERE user_id = ANY($1::uuid[])', [ids]);
      await migrator.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function fixture(label: string, balanceCents = '100000'): Promise<Fixture> {
  const response = await auth.register({ name: 'Prueba Financiera',
    email: `t15-${label}-${randomUUID()}@treo.test`, password: 'T15-TestOnlyPassword-123!' });
  const userId = response.user.id;
  users.add(userId);
  const accounts = db.getRepository(AccountEntity);
  const source = await accounts.findOneByOrFail({ userId });
  const destination = await accounts.save(accounts.create({
    userId, clabe: generateDemoClabe(), currency: 'MXN',
    balanceCents: '0', status: 'ACTIVE',
  }));
  // This is a privileged TEST-ONLY fixture initialization, never application code.
  await migrator.query('UPDATE accounts SET balance_cents = $2::bigint WHERE id = $1', [source.id, balanceCents]);
  return { userId, sourceId: source.id, destinationId: destination.id,
    destinationClabe: destination.clabe };
}

function submission(f: Fixture, amount = '100.25', key = randomUUID()): SubmitTransferInput {
  return { authenticatedUserId: f.userId, idempotencyKey: key, requestId: randomUUID(),
    payload: { sourceAccountId: f.sourceId, destinationAccountId: f.destinationId,
      amount, concept: 'Prueba contable', reference: '0001234' } };
}

/** Full real PostgreSQL transaction with explicit rollback after assertions. */
async function rollbackCase(run: (tx: Parameters<typeof service.submitInTransaction>[0]) => Promise<void>): Promise<void> {
  await assert.rejects(db.transaction('READ COMMITTED', async (tx) => {
    await run(tx);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
}

async function money(tx: Parameters<typeof service.submitInTransaction>[0], f: Fixture) {
  const rows = await tx.query(`SELECT id,balance_cents FROM accounts WHERE id = ANY($1::uuid[])`,
    [[f.sourceId, f.destinationId]]) as Array<{id: string;balance_cents: string}>;
  return new Map(rows.map((row) => [row.id, row.balance_cents]));
}

test('T-15: COMPLETED es atómica: balances, 2 asientos, cupo y audit event', async () => {
  const f = await fixture('posted');
  await rollbackCase(async (tx) => {
    const input = submission(f);
    const result = await service.submitInTransaction(tx, input);
    assert.equal(result.outcome, 'COMPLETED');
    if (result.outcome !== 'COMPLETED') return;
    assert.equal(result.transfer.status, 'COMPLETED');
    assert.equal(result.transfer.amountCents, '10025');
    assert.equal(result.transfer.destinationAccountMasked, `**************${f.destinationClabe.slice(-4)}`);
    assert.ok(result.transfer.completedAt);
    const updated = await money(tx, f);
    assert.equal(updated.get(f.sourceId), '89975');
    assert.equal(updated.get(f.destinationId), '10025');
    const lines = await tx.query(`SELECT type,account_id,signed_amount_cents FROM ledger_entries
      WHERE transfer_id=$1 ORDER BY type`, [result.transfer.id]) as Array<{
      type:string;account_id:string;signed_amount_cents:string
    }>;
    assert.equal(lines.length, 2);
    assert.equal(lines.find((x) => x.type === 'DEBIT')?.signed_amount_cents, '-10025');
    assert.equal(lines.find((x) => x.type === 'CREDIT')?.signed_amount_cents, '10025');
    assert.equal(lines.reduce((sum, x) => sum + BigInt(x.signed_amount_cents), 0n), 0n);
    const usage = await tx.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',
      [f.userId]) as Array<{spent_cents:string}>;
    assert.equal(usage[0]?.spent_cents, '10025');
    const audits = await tx.query(`SELECT action,metadata_sanitized FROM audit_events WHERE transfer_id=$1`,
      [result.transfer.id]) as Array<{action:string; metadata_sanitized:Record<string,unknown>}>;
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.action, 'TRANSFER_COMPLETED');
    assert.equal(JSON.stringify(audits).includes(f.destinationClabe), false);
  });
  assert.deepEqual((await db.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',
    [f.userId]) as unknown[]), []);
  assert.equal((await db.getRepository(AccountEntity).findOneByOrFail({ id: f.sourceId })).balanceCents, '100000');
});

test('T-15: replay COMPLETED no duplica ledger, saldo, cuota ni auditoría', async () => {
  const f = await fixture('replay');
  await rollbackCase(async (tx) => {
    const req = submission(f, '50.00');
    const first = await service.submitInTransaction(tx, req);
    const second = await service.submitInTransaction(tx, req);
    assert.equal(first.outcome, 'COMPLETED');
    assert.equal(second.outcome, 'COMPLETED');
    if (first.outcome !== 'COMPLETED' || second.outcome !== 'COMPLETED') return;
    assert.equal(first.transfer.id, second.transfer.id);
    assert.equal(second.replayed, true);
    const ledger = await tx.query('SELECT id FROM ledger_entries WHERE transfer_id=$1',
      [first.transfer.id]) as unknown[];
    assert.equal(ledger.length, 2);
    const audit = await tx.query('SELECT id FROM audit_events WHERE transfer_id=$1',
      [first.transfer.id]) as unknown[];
    assert.equal(audit.length, 1);
    const updated = await money(tx, f);
    assert.equal(updated.get(f.sourceId), '95000');
  });
});

test('T-15: misma llave y otro importe da 409, sin segunda transferencia', async () => {
  const f = await fixture('collision');
  await rollbackCase(async (tx) => {
    const input = submission(f, '10.00');
    const created = await service.submitInTransaction(tx, input);
    const conflict = await service.submitInTransaction(tx, {
      ...input, payload: { ...input.payload as Record<string, unknown>, amount: '11.00' },
    });
    assert.equal(created.outcome, 'COMPLETED');
    assert.equal(conflict.outcome, 'ERROR');
    if (conflict.outcome === 'ERROR') assert.equal(conflict.problem.code, 'IDEMPOTENCY_CONFLICT');
    const rows = await tx.query('SELECT id FROM transfers WHERE sender_user_id=$1', [f.userId]) as unknown[];
    assert.equal(rows.length, 1);
  });
});

test('T-15: saldo insuficiente produce REJECTED sin asientos ni cupo', async () => {
  const f = await fixture('insufficient', '99');
  await rollbackCase(async (tx) => {
    const input = submission(f, '1.00');
    const fail = await service.submitInTransaction(tx, input);
    assert.equal(fail.outcome, 'ERROR');
    if (fail.outcome !== 'ERROR') return;
    assert.equal(fail.problem.code, 'INSUFFICIENT_FUNDS');
    const state = await tx.query('SELECT status,rejection_code FROM transfers WHERE id=$1',
      [fail.transferId]) as Array<{status:string;rejection_code:string}>;
    assert.equal(state[0]?.status, 'REJECTED');
    const replay = await service.submitInTransaction(tx, input);
    assert.equal(replay.outcome, 'ERROR');
    if (replay.outcome === 'ERROR') assert.equal(replay.problem.code, 'INSUFFICIENT_FUNDS');
    assert.equal((await tx.query('SELECT id FROM ledger_entries WHERE transfer_id=$1',
      [fail.transferId]) as unknown[]).length, 0);
    assert.equal((await tx.query('SELECT user_id FROM daily_transfer_usage WHERE user_id=$1',
      [f.userId]) as unknown[]).length, 0);
    const balances = await money(tx, f);
    assert.equal(balances.get(f.sourceId), '99');
  });
});

test('T-15: límite diario se calcula en calendario Ciudad de México y rechaza exceso', async () => {
  const f = await fixture('daily-cap', '2000000');
  await rollbackCase(async (tx) => {
    const now = await tx.query(`SELECT (clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date::text AS date`) as Array<{date:string}>;
    await tx.query(`INSERT INTO daily_transfer_usage(user_id,business_date,spent_cents)
      VALUES($1,$2::date,1995000)`, [f.userId, now[0]!.date]);
    const blocked = await service.submitInTransaction(tx, submission(f, '50.01'));
    assert.equal(blocked.outcome, 'ERROR');
    if (blocked.outcome === 'ERROR') assert.equal(blocked.problem.code, 'DAILY_LIMIT_EXCEEDED');
    const allowed = await service.submitInTransaction(tx, submission(f, '50.00'));
    assert.equal(allowed.outcome, 'COMPLETED');
    const spent = await tx.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',
      [f.userId]) as Array<{spent_cents:string}>;
    assert.equal(spent[0]?.spent_cents, '2000000');
    assert.equal((await tx.query('SELECT id FROM ledger_entries WHERE transfer_id=$1',
      [blocked.outcome === 'ERROR' ? blocked.transferId : null]) as unknown[]).length, 0);
  });
});

test('T-15: beneficiario interno de otro usuario puede recibir crédito', async () => {
  const sender = await fixture('beneficiary-sender', '250000');
  const receiver = await fixture('beneficiary-receiver', '0');
  const benefit = await db.getRepository(BeneficiaryEntity).save(db.getRepository(BeneficiaryEntity).create({
    userId: sender.userId, clabe: receiver.destinationClabe, name: 'Recepción', alias: 'Interno',
  }));
  await rollbackCase(async (tx) => {
    const sent = await service.submitInTransaction(tx, {
      authenticatedUserId: sender.userId, idempotencyKey: randomUUID(),
      payload: { sourceAccountId: sender.sourceId, beneficiaryId: benefit.id,
        amount: '500.00', concept: 'A tercero', reference: '006' },
    });
    assert.equal(sent.outcome, 'COMPLETED');
    if (sent.outcome !== 'COMPLETED') return;
    assert.equal(sent.transfer.kind, 'BENEFICIARY');
    const recipient = await tx.query('SELECT balance_cents FROM accounts WHERE id=$1',
      [receiver.destinationId]) as Array<{balance_cents:string}>;
    assert.equal(recipient[0]?.balance_cents, '50000');
  });
});

test('T-15: fuente BLOCKED o ajena se rechaza sin mover dinero', async () => {
  const sender = await fixture('blocked', '100000');
  const outsider = await fixture('outsider', '100000');
  await rollbackCase(async (tx) => {
    await tx.query("UPDATE accounts SET status='BLOCKED' WHERE id=$1", [sender.sourceId]);
    await assert.rejects(service.submitInTransaction(tx, submission(sender, '1.00')),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error));
    const noMoney = await money(tx, sender);
    assert.equal(noMoney.get(sender.sourceId), '100000');
  });
  await rollbackCase(async (tx) => {
    await assert.rejects(service.submitInTransaction(tx, { ...submission(sender, '1.00'),
      payload: { sourceAccountId: outsider.sourceId, destinationAccountId: sender.destinationId,
        amount: '1.00', concept: 'Ajeno', reference: '123' } }),
      (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error));
  });
});

test('T-15: importe superior a $5,000 requiere OTP y no crea intención sin desafío', async () => {
  const f = await fixture('otp-boundary', '1000000');
  await rollbackCase(async (tx) => {
    const high = await service.submitInTransaction(tx, submission(f, '5000.01'));
    assert.equal(high.outcome, 'ERROR');
    if (high.outcome === 'ERROR') assert.equal(high.problem.code, 'OTP_NOT_AVAILABLE');
    const rows = await tx.query('SELECT id FROM transfers WHERE sender_user_id=$1', [f.userId]) as unknown[];
    assert.equal(rows.length, 0);
    const exact = await service.submitInTransaction(tx, submission(f, '5000.00'));
    assert.equal(exact.outcome, 'COMPLETED');
  });
});

test('T-15 HTTP: bearer obligatorio, Idempotency-Key requerido, validación RFC7807', async () => {
  const f = await fixture('route', '100000');
  // JWT helper directly issues a valid access token for the registered test user.
  const access = await tokens.issue(f.userId);
  const input = submission(f, '1.00');
  await request(app).post('/api/v1/transfers').send(input.payload as Record<string, unknown>).expect(401);
  const missing = await request(app).post('/api/v1/transfers')
    .set('Authorization', `Bearer ${access}`).send(input.payload as Record<string, unknown>).expect(400);
  assert.equal(missing.body.code, 'INVALID_IDEMPOTENCY_KEY');
  const invalid = await request(app).post('/api/v1/transfers')
    .set('Authorization', `Bearer ${access}`)
    .set('Idempotency-Key', randomUUID())
    .send({ ...input.payload as Record<string, unknown>, reference: '99999999' }).expect(400);
  assert.equal(invalid.body.code, 'INVALID_REQUEST');
});
