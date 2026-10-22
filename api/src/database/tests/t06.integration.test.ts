import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { createDataSource, type DatabaseRole } from '../data-source.js';

// Every test uses treo_test and rolls back fixtures; no persistent demo balances.
async function inTransaction(
  role: DatabaseRole,
  body: (runner: QueryRunner) => Promise<void>,
): Promise<void> {
  const datasource = createDataSource(role, 'test');
  await datasource.initialize();
  const runner = datasource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await body(runner);
  } finally {
    if (runner.isTransactionActive) {
      try { await runner.rollbackTransaction(); } catch { /* PostgreSQL might already have rolled back. */ }
    }
    await runner.release();
    await datasource.destroy();
  }
}

function hasSqlState(error: unknown, code: string): boolean {
  const candidate = error as { code?: string; driverError?: { code?: string } } | null;
  return candidate?.driverError?.code === code || candidate?.code === code;
}

async function expectSqlError(
  runner: QueryRunner,
  sql: string,
  params: unknown[],
  state: string,
): Promise<void> {
  await runner.query('SAVEPOINT t06_expected_error');
  try {
    await assert.rejects(
      runner.query(sql, params),
      (error: unknown) => hasSqlState(error, state),
    );
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT t06_expected_error');
    await runner.query('RELEASE SAVEPOINT t06_expected_error');
  }
}

// Materialize the deferred triggers *inside a savepoint*, without committing
// financial fixtures or overwriting the real test schema.
async function expectDeferredFailure(
  runner: QueryRunner,
  action: () => Promise<void>,
): Promise<void> {
  await runner.query('SAVEPOINT t06_deferred_case');
  try {
    await action();
    await assert.rejects(
      runner.query('SET CONSTRAINTS ALL IMMEDIATE'),
      (error: unknown) => hasSqlState(error, '23514'),
    );
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT t06_deferred_case');
    await runner.query('RELEASE SAVEPOINT t06_deferred_case');
  }
}

function clabe(): string {
  // This fixture checks SQL shape, not the CLABE checksum (T-12).
  return BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString(10).padStart(18, '0').slice(0, 18);
}

async function createUser(runner: QueryRunner): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO public.users (name, email_canonical, password_hash)
     VALUES ($1, $2, $3) RETURNING id`,
    ['T06 fixture user', `t06-${randomUUID()}@example.test`, 'test-hash-not-for-auth'],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

async function createAccount(runner: QueryRunner, userId: string): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO public.accounts (user_id, clabe) VALUES ($1, $2) RETURNING id`,
    [userId, clabe()],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

async function setup(runner: QueryRunner): Promise<{
  ownerId: string; sourceId: string; destinationId: string; otherId: string;
}> {
  const ownerId = await createUser(runner);
  return {
    ownerId,
    sourceId: await createAccount(runner, ownerId),
    destinationId: await createAccount(runner, ownerId),
    otherId: await createAccount(runner, ownerId),
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

async function createTransfer(
  runner: QueryRunner,
  f: Fixture,
  status: 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'PENDING_CONFIRMATION' = 'PROCESSING',
): Promise<string> {
  const rows: Array<{ id: string }> = await runner.query(
    `INSERT INTO public.transfers
      (sender_user_id, source_account_id, destination_account_id, kind,
       amount_cents, concept, reference, idempotency_key, payload_hash,
       status, completed_at)
     VALUES ($1,$2,$3,'OWN_ACCOUNTS',250,'Integridad T06','000001',
             $4,$5,$6,CASE WHEN $6 = 'COMPLETED' THEN clock_timestamp() ELSE NULL END)
     RETURNING id`,
    [f.ownerId, f.sourceId, f.destinationId, randomUUID(), 'a'.repeat(64), status],
  );
  assert.ok(rows[0]);
  return rows[0].id;
}

async function addEntry(
  runner: QueryRunner,
  transferId: string,
  accountId: string,
  type: 'DEBIT' | 'CREDIT',
  signedAmount: string,
): Promise<void> {
  await runner.query(
    `INSERT INTO public.ledger_entries
      (transfer_id, account_id, type, signed_amount_cents)
     VALUES ($1,$2,$3,$4)`,
    [transferId, accountId, type, signedAmount],
  );
}

async function complete(runner: QueryRunner, transferId: string): Promise<void> {
  await runner.query(
    `UPDATE public.transfers
     SET status = 'COMPLETED', completed_at = clock_timestamp()
     WHERE id = $1`,
    [transferId],
  );
}

async function addBalancedEntries(runner: QueryRunner, id: string, f: Fixture): Promise<void> {
  await addEntry(runner, id, f.sourceId, 'DEBIT', '-250');
  await addEntry(runner, id, f.destinationId, 'CREDIT', '250');
}

test('T-06: los dos constraint triggers están diferidos inicialmente', async () => {
  await inTransaction('app', async (runner) => {
    const rows: Array<{ tgname: string; tgdeferrable: boolean; tginitdeferred: boolean }> =
      await runner.query(`
        SELECT tgname, tgdeferrable, tginitdeferred
        FROM pg_trigger WHERE tgname IN ('treo_verify_transfers_ledger','treo_verify_entries_ledger')
      `);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.tgdeferrable, true, row.tgname);
      assert.equal(row.tginitdeferred, true, row.tgname);
    }
  });
});

test('T-06: un COMPLETED sin asientos o solo con DEBIT es rechazado', async () => {
  await inTransaction('app', async (runner) => {
    const f = await setup(runner);
    await expectDeferredFailure(runner, async () => {
      await createTransfer(runner, f, 'COMPLETED');
    });
    await expectDeferredFailure(runner, async () => {
      const id = await createTransfer(runner, f);
      await addEntry(runner, id, f.sourceId, 'DEBIT', '-250');
      await complete(runner, id);
    });
  });
});

test('T-06: cuentas, signos e importes deben coincidir exactamente', async () => {
  await inTransaction('app', async (runner) => {
    const f = await setup(runner);
    await expectDeferredFailure(runner, async () => {
      const id = await createTransfer(runner, f);
      await addEntry(runner, id, f.sourceId, 'DEBIT', '-250');
      await addEntry(runner, id, f.destinationId, 'CREDIT', '249');
      await complete(runner, id);
    });
    await expectDeferredFailure(runner, async () => {
      const id = await createTransfer(runner, f);
      await addEntry(runner, id, f.otherId, 'DEBIT', '-250');
      await addEntry(runner, id, f.destinationId, 'CREDIT', '250');
      await complete(runner, id);
    });
    await expectDeferredFailure(runner, async () => {
      const id = await createTransfer(runner, f);
      await addEntry(runner, id, f.sourceId, 'DEBIT', '-250');
      await addEntry(runner, id, f.otherId, 'CREDIT', '250');
      await complete(runner, id);
    });
  });
});

test('T-06: dos asientos balanceados permiten completar; un tercero es rechazado', async () => {
  await inTransaction('app', async (runner) => {
    const f = await setup(runner);
    const id = await createTransfer(runner, f);
    await addBalancedEntries(runner, id, f);
    await complete(runner, id);
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    const result: Array<{ status: string }> = await runner.query(
      'SELECT status FROM public.transfers WHERE id = $1', [id],
    );
    assert.equal(result[0]?.status, 'COMPLETED');
    // T-05 unique (transfer_id,type) also rules out a third DEBIT or CREDIT.
    await expectSqlError(
      runner,
      `INSERT INTO public.ledger_entries (transfer_id, account_id, type, signed_amount_cents)
       VALUES ($1,$2,'DEBIT',-250)`,
      [id, f.sourceId], '23505',
    );
  });
});

test('T-06: pendientes de OTP y rechazadas no pueden conservar asientos', async () => {
  await inTransaction('app', async (runner) => {
    const f = await setup(runner);
    for (const status of ['PENDING_CONFIRMATION', 'REJECTED'] as const) {
      await expectDeferredFailure(runner, async () => {
        const id = await createTransfer(runner, f, status);
        await addEntry(runner, id, f.sourceId, 'DEBIT', '-250');
      });
    }
  });
});

test('T-06: el rol migrator tampoco puede mutar asientos ni transferencias terminales', async () => {
  await inTransaction('migrator', async (runner) => {
    const f = await setup(runner);
    const id = await createTransfer(runner, f);
    await addBalancedEntries(runner, id, f);
    await complete(runner, id);
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');

    await expectSqlError(runner,
      'UPDATE public.ledger_entries SET signed_amount_cents = -251 WHERE transfer_id = $1',
      [id], '23514');
    await expectSqlError(runner,
      'DELETE FROM public.ledger_entries WHERE transfer_id = $1',
      [id], '23514');
    await expectSqlError(runner, 'TRUNCATE public.ledger_entries', [], '23514');
    await expectSqlError(runner,
      "UPDATE public.transfers SET status = 'PROCESSING', completed_at = NULL WHERE id = $1",
      [id], '23514');
    await expectSqlError(runner,
      'UPDATE public.transfers SET amount_cents = 300 WHERE id = $1',
      [id], '23514');
    await expectSqlError(runner, 'DELETE FROM public.transfers WHERE id = $1', [id], '23514');

    const rejectedId = await createTransfer(runner, f, 'REJECTED');
    await expectSqlError(runner,
      "UPDATE public.transfers SET status = 'PROCESSING' WHERE id = $1",
      [rejectedId], '23514');
  });
});

test('T-06: auditoría es insertable pero no actualizable, borrable ni truncable por app', async () => {
  await inTransaction('app', async (runner) => {
    const current: Array<{ current_user: string }> = await runner.query('SELECT current_user');
    assert.equal(current[0]?.current_user, 'treo_app');
    const rows: Array<{ id: string }> = await runner.query(
      `INSERT INTO public.audit_events (action, metadata_sanitized)
       VALUES ('T06_SECURITY_TEST','{}'::jsonb) RETURNING id`,
    );
    assert.ok(rows[0]);
    for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE']) {
      const grants: Array<{ allowed: boolean }> = await runner.query(
        `SELECT has_table_privilege(current_user, 'public.audit_events', $1) AS allowed`, [privilege],
      );
      assert.equal(grants[0]?.allowed, false, privilege);
    }
    await expectSqlError(runner,
      'UPDATE public.audit_events SET action = $1 WHERE id = $2',
      ['MODIFIED', rows[0].id], '42501');
    await expectSqlError(runner,
      'DELETE FROM public.audit_events WHERE id = $1', [rows[0].id], '42501');
    await expectSqlError(runner, 'TRUNCATE public.audit_events', [], '42501');
  });
});

test('T-06: audit append-only bloquea UPDATE, DELETE y TRUNCATE incluso para migrator', async () => {
  await inTransaction('migrator', async (runner) => {
    const rows: Array<{ id: string }> = await runner.query(
      `INSERT INTO public.audit_events (action, metadata_sanitized)
       VALUES ('T06_OWNER_TEST','{}'::jsonb) RETURNING id`,
    );
    assert.ok(rows[0]);
    await expectSqlError(runner,
      'UPDATE public.audit_events SET action = $1 WHERE id = $2',
      ['MODIFIED', rows[0].id], '23514');
    await expectSqlError(runner,
      'DELETE FROM public.audit_events WHERE id = $1', [rows[0].id], '23514');
    await expectSqlError(runner, 'TRUNCATE public.audit_events', [], '23514');
  });
});
