import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { createDataSource } from '../data-source.js';
import { TransferEntity } from '../../modules/transfers/entities/transfer.entity.js';
import { LedgerEntryEntity } from '../../modules/transfers/entities/ledger-entry.entity.js';
import { DailyTransferUsageEntity } from '../../modules/transfers/entities/daily-transfer-usage.entity.js';
import { OtpChallengeEntity } from '../../modules/transfers/entities/otp-challenge.entity.js';
import { AuditEventEntity } from '../../modules/audit/entities/audit-event.entity.js';

/** T-05 tests run with treo_app on treo_test and always roll back their fixtures. */
async function transaction(run: (runner: QueryRunner) => Promise<void>): Promise<void> {
  const ds = createDataSource('app', 'test');
  await ds.initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await run(runner);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
}

function isPgCode(error: unknown, code: string): boolean {
  const candidate = error as { driverError?: { code?: string }; code?: string };
  return candidate?.driverError?.code === code || candidate?.code === code;
}

async function expectPgError(
  runner: QueryRunner, sql: string, params: unknown[], code: string,
): Promise<void> {
  await runner.query('SAVEPOINT t05_expected_error');
  try {
    await assert.rejects(runner.query(sql, params), (error: unknown) => isPgCode(error, code));
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT t05_expected_error');
    await runner.query('RELEASE SAVEPOINT t05_expected_error');
  }
}

function clabe(): string {
  return BigInt(`0x${createHash('sha256').update(randomUUID()).digest('hex')}`)
    .toString(10).slice(0, 18);
}

async function user(runner: QueryRunner): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1, $2, $3) RETURNING "id"',
    ['Usuario pruebas T05', `t05-${randomUUID()}@example.test`, 'fixture-hash-not-for-auth'],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

async function account(runner: QueryRunner, userId: string): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    'INSERT INTO "accounts" ("user_id", "clabe") VALUES ($1, $2) RETURNING "id"',
    [userId, clabe()],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

async function beneficiary(runner: QueryRunner, userId: string): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    'INSERT INTO "beneficiaries" ("user_id", "name", "alias", "clabe") VALUES ($1, $2, $3, $4) RETURNING "id"',
    [userId, 'Contacto de prueba', 'Contacto', clabe()],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

type TransferInput = {
  senderUserId: string;
  sourceAccountId: string;
  destinationAccountId: string | null;
  beneficiaryId?: string | null;
  kind?: string;
  amountCents?: string;
  concept?: string;
  reference?: string;
  idempotencyKey?: string;
  payloadHash?: string;
  status?: string;
  requiresOtp?: boolean;
};

const insertTransfer = `
  INSERT INTO "transfers" (
    "sender_user_id", "source_account_id", "destination_account_id", "beneficiary_id",
    "kind", "amount_cents", "concept", "reference", "idempotency_key",
    "payload_hash", "status", "requires_otp"
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  RETURNING "id", "amount_cents", "status"
`;

function transferParams(input: TransferInput): unknown[] {
  return [
    input.senderUserId,
    input.sourceAccountId,
    input.destinationAccountId,
    input.beneficiaryId ?? null,
    input.kind ?? 'OWN_ACCOUNTS',
    input.amountCents ?? '250',
    input.concept ?? 'Concepto de prueba',
    input.reference ?? '0000123',
    input.idempotencyKey ?? randomUUID(),
    input.payloadHash ?? 'a'.repeat(64),
    input.status ?? 'PROCESSING',
    input.requiresOtp ?? false,
  ];
}

async function transfer(runner: QueryRunner, input: TransferInput): Promise<string> {
  const rows: Array<{ id: string; amount_cents: string }> = await runner.query(
    insertTransfer, transferParams(input),
  );
  assert.ok(rows[0]);
  assert.equal(typeof rows[0].amount_cents, 'string');
  return rows[0].id;
}

test('T-05: TypeORM registra cinco entidades financieras sin synchronize', async () => {
  const ds = createDataSource('app', 'test');
  assert.equal(ds.options.synchronize, false);
  await ds.initialize();
  try {
    for (const entity of [TransferEntity, LedgerEntryEntity, DailyTransferUsageEntity, OtpChallengeEntity, AuditEventEntity]) {
      assert.ok(ds.hasMetadata(entity), `${entity.name} sin metadata`);
    }
    assert.equal(ds.getMetadata(TransferEntity).findColumnWithPropertyName('amountCents')?.type, 'bigint');
    assert.equal(ds.getMetadata(LedgerEntryEntity).findColumnWithPropertyName('signedAmountCents')?.type, 'bigint');
    assert.equal(ds.getMetadata(DailyTransferUsageEntity).findColumnWithPropertyName('spentCents')?.type, 'bigint');
  } finally {
    await ds.destroy();
  }
});

test('T-05: idempotencia única por remitente y dos modalidades de transferencia', async () => {
  await transaction(async (runner) => {
    const senderA = await user(runner);
    const senderB = await user(runner);
    const aSource = await account(runner, senderA);
    const aDest = await account(runner, senderA);
    const bSource = await account(runner, senderB);
    const bDest = await account(runner, senderB);
    const key = randomUUID();
    const first = await transfer(runner, {
      senderUserId: senderA, sourceAccountId: aSource,
      destinationAccountId: aDest, idempotencyKey: key,
    });
    assert.ok(first);
    await expectPgError(runner, insertTransfer, transferParams({
      senderUserId: senderA, sourceAccountId: aSource,
      destinationAccountId: aDest, idempotencyKey: key,
    }), '23505');
    const second = await transfer(runner, {
      senderUserId: senderB, sourceAccountId: bSource,
      destinationAccountId: bDest, idempotencyKey: key,
    });
    assert.notEqual(first, second);

    const recipient = await beneficiary(runner, senderA);
    const viaBeneficiary = await transfer(runner, {
      senderUserId: senderA, sourceAccountId: aSource,
      destinationAccountId: bSource, beneficiaryId: recipient, kind: 'BENEFICIARY',
    });
    assert.ok(viaBeneficiary);
    // An unresolved beneficiary can be recorded as a rejected intent without an internal destination.
    const unresolved = await transfer(runner, {
      senderUserId: senderA, sourceAccountId: aSource,
      destinationAccountId: null, beneficiaryId: recipient, kind: 'BENEFICIARY', status: 'REJECTED',
    });
    assert.ok(unresolved);
  });
});

test('T-05: importes, estado, tipo, cuenta propia, concepto, referencia y huella inválidos', async () => {
  await transaction(async (runner) => {
    const sender = await user(runner);
    const source = await account(runner, sender);
    const destination = await account(runner, sender);
    const base: TransferInput = { senderUserId: sender, sourceAccountId: source, destinationAccountId: destination };
    const badCases: Array<Partial<TransferInput>> = [
      { amountCents: '0' }, { amountCents: '-1' },
      { kind: 'OUTBOUND' }, { status: 'UNKNOWN' },
      { reference: '12345678' }, { reference: 'a12' },
      { concept: ' ' }, { concept: 'x'.repeat(141) },
      { payloadHash: 'not-a-sha256' },
      { destinationAccountId: source },
      { destinationAccountId: null },
      { beneficiaryId: randomUUID() },
    ];
    for (const change of badCases) {
      await expectPgError(runner, insertTransfer, transferParams({ ...base, ...change }), '23514');
    }
    await expectPgError(runner, insertTransfer, transferParams({
      ...base, senderUserId: randomUUID(),
    }), '23503');
    await expectPgError(runner, insertTransfer, transferParams({
      ...base, sourceAccountId: randomUUID(),
    }), '23503');
  });
});

test('T-05: ledger con signos correctos, sin duplicados y sin DELETE para rol aplicación', async () => {
  await transaction(async (runner) => {
    const sender = await user(runner);
    const source = await account(runner, sender);
    const destination = await account(runner, sender);
    const transferId = await transfer(runner, {
      senderUserId: sender, sourceAccountId: source, destinationAccountId: destination,
    });
    const insert = `INSERT INTO "ledger_entries" ("transfer_id", "account_id", "type", "signed_amount_cents") VALUES ($1,$2,$3,$4) RETURNING "signed_amount_cents"`;
    const debit: Array<{ signed_amount_cents: string }> = await runner.query(insert, [transferId, source, 'DEBIT', '-250']);
    const credit: Array<{ signed_amount_cents: string }> = await runner.query(insert, [transferId, destination, 'CREDIT', '250']);
    assert.equal(debit[0]?.signed_amount_cents, '-250');
    assert.equal(credit[0]?.signed_amount_cents, '250');
    await expectPgError(runner, insert, [transferId, source, 'DEBIT', '-250'], '23505');
    await expectPgError(runner, insert, [transferId, source, 'DEBIT', '250'], '23514');
    await expectPgError(runner, insert, [transferId, destination, 'CREDIT', '-250'], '23514');
    await expectPgError(runner, insert, [transferId, destination, 'UNKNOWN', '250'], '23514');
    await expectPgError(runner, insert, [randomUUID(), destination, 'CREDIT', '250'], '23503');
    await expectPgError(runner, 'UPDATE "ledger_entries" SET "signed_amount_cents" = 1 WHERE "transfer_id" = $1', [transferId], '42501');
    await expectPgError(runner, 'DELETE FROM "ledger_entries" WHERE "transfer_id" = $1', [transferId], '42501');
  });
});

test('T-05: límite diario, PK compuesta, rango y FK de consumo por usuario', async () => {
  await transaction(async (runner) => {
    const sender = await user(runner);
    const insert = 'INSERT INTO "daily_transfer_usage" ("user_id", "business_date", "spent_cents") VALUES ($1,$2,$3)';
    await runner.query(insert, [sender, '2026-10-21', '2000000']);
    await expectPgError(runner, insert, [sender, '2026-10-21', '1'], '23505');
    await expectPgError(runner, insert, [sender, '2026-10-22', '-1'], '23514');
    await expectPgError(runner, insert, [sender, '2026-10-22', '2000001'], '23514');
    await expectPgError(runner, insert, [randomUUID(), '2026-10-21', '1'], '23503');
    await runner.query(insert, [sender, '2026-10-22', '0']);
    const rows: Array<{ spent_cents: string }> = await runner.query(
      'SELECT "spent_cents" FROM "daily_transfer_usage" WHERE "user_id" = $1 AND "business_date" = $2',
      [sender, '2026-10-21'],
    );
    assert.equal(rows[0]?.spent_cents, '2000000');
  });
});

test('T-05: OTP único por transferencia, máximo tres fallos y FK obligatoria', async () => {
  await transaction(async (runner) => {
    const sender = await user(runner);
    const source = await account(runner, sender);
    const destination = await account(runner, sender);
    const transferId = await transfer(runner, {
      senderUserId: sender, sourceAccountId: source, destinationAccountId: destination,
      amountCents: '500001', status: 'PENDING_CONFIRMATION', requiresOtp: true,
    });
    const insert = `INSERT INTO "otp_challenges" ("transfer_id", "code_hash", "failed_attempts", "expires_at") VALUES ($1,$2,$3,now() + INTERVAL '5 minutes')`;
    await runner.query(insert, [transferId, 'fixture-hash-not-otp', 0]);
    await expectPgError(runner, insert, [transferId, 'fixture-hash-other', 1], '23505');
    await expectPgError(runner, insert, [randomUUID(), 'fixture-hash', 0], '23503');
    const transferId2 = await transfer(runner, {
      senderUserId: sender, sourceAccountId: source, destinationAccountId: destination,
      amountCents: '500001', status: 'PENDING_CONFIRMATION', requiresOtp: true,
    });
    await expectPgError(runner, insert, [transferId2, 'fixture-hash', 4], '23514');
    await expectPgError(runner, insert, [transferId2, 'fixture-hash', -1], '23514');
    await runner.query(insert, [transferId2, 'fixture-hash', 3]);
  });
});

test('T-05: auditoría insertable, JSONB objeto, FK y protección de mutaciones por rol', async () => {
  await transaction(async (runner) => {
    const sender = await user(runner);
    const source = await account(runner, sender);
    const destination = await account(runner, sender);
    const transferId = await transfer(runner, {
      senderUserId: sender, sourceAccountId: source, destinationAccountId: destination,
    });
    const insert = `INSERT INTO "audit_events" ("actor_user_id", "transfer_id", "action", "metadata_sanitized", "request_id") VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING "id", "metadata_sanitized"`;
    const rows: Array<{ id: string; metadata_sanitized: { fixture: boolean } }> = await runner.query(
      insert, [sender, transferId, 'TRANSFER_INTENT_CREATED', JSON.stringify({ fixture: true }), randomUUID()],
    );
    assert.ok(rows[0]);
    assert.equal(rows[0].metadata_sanitized.fixture, true);
    await expectPgError(runner, insert, [sender, transferId, ' ', '{}', randomUUID()], '23514');
    await expectPgError(runner, insert, [sender, transferId, 'ACTION', '[]', randomUUID()], '23514');
    await expectPgError(runner, insert, [randomUUID(), transferId, 'ACTION', '{}', randomUUID()], '23503');
    await expectPgError(runner, insert, [sender, randomUUID(), 'ACTION', '{}', randomUUID()], '23503');
    await expectPgError(runner, 'UPDATE "audit_events" SET "action" = $1 WHERE "id" = $2', ['CHANGED', rows[0].id], '42501');
    await expectPgError(runner, 'DELETE FROM "audit_events" WHERE "id" = $1', [rows[0].id], '42501');
    await expectPgError(runner, 'TRUNCATE "audit_events"', [], '42501');
  });
});
