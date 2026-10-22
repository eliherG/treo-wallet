import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { createDataSource } from '../data-source.js';
import { UserEntity } from '../../modules/auth/entities/user.entity.js';
import { AccountEntity } from '../../modules/accounts/entities/account.entity.js';
import { RefreshTokenEntity } from '../../modules/auth/entities/refresh-token.entity.js';

/** T-03 tests only treo_test, always inside a rollback transaction. */
async function transaction(testBody: (query: QueryRunner) => Promise<void>): Promise<void> {
  const ds = createDataSource('app', 'test');
  await ds.initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await testBody(runner);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await ds.destroy();
  }
}

function hasPgCode(err: unknown, expected: string): boolean {
  const e = err as { driverError?: { code?: string }; code?: string };
  return e?.driverError?.code === expected || e?.code === expected;
}

async function expectPgError(
  runner: QueryRunner,
  sql: string,
  parameters: unknown[],
  sqlState: string,
): Promise<void> {
  // A PostgreSQL error aborts the transaction until ROLLBACK TO SAVEPOINT.
  await runner.query('SAVEPOINT t03_expected_error');
  try {
    await assert.rejects(runner.query(sql, parameters), (error: unknown) => hasPgCode(error, sqlState));
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT t03_expected_error');
    await runner.query('RELEASE SAVEPOINT t03_expected_error');
  }
}

async function user(runner: QueryRunner): Promise<string> {
  const email = `t03-${randomUUID()}@example.test`;
  const rows: Array<{ id: string }> = await runner.query(
    'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1,$2,$3) RETURNING "id"',
    ['Usuario de prueba', email, 'fixture-hash-not-for-authentication'],
  );
  const id = rows[0]?.id;
  assert.ok(id);
  return id;
}

test('T-03: TypeORM reconoce las tres entidades, sin synchronize', async () => {
  const ds = createDataSource('app', 'test');
  assert.equal(ds.options.synchronize, false);
  await ds.initialize();
  try {
    assert.ok(ds.hasMetadata(UserEntity));
    assert.ok(ds.hasMetadata(AccountEntity));
    assert.ok(ds.hasMetadata(RefreshTokenEntity));
  } finally {
    await ds.destroy();
  }
});

test('T-03: correo único/canónico, nombre y FK de cuentas', async () => {
  await transaction(async (runner) => {
    const id = await user(runner);
    const rows: Array<{ email_canonical: string }> = await runner.query(
      'SELECT "email_canonical" FROM "users" WHERE "id" = $1', [id],
    );
    const email = rows[0]?.email_canonical;
    assert.ok(email);

    await expectPgError(runner,
      'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1,$2,$3)',
      ['Otro usuario', email, 'fixture-hash'], '23505');
    await expectPgError(runner,
      'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1,$2,$3)',
      ['Otro usuario', email.toUpperCase(), 'fixture-hash'], '23514');
    await expectPgError(runner,
      'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1,$2,$3)',
      ['X', `short-${randomUUID()}@example.test`, 'fixture-hash'], '23514');
    await expectPgError(runner,
      'INSERT INTO "accounts" ("user_id", "clabe") VALUES ($1,$2)',
      [randomUUID(), '002010123456789012'], '23503');
  });
});

test('T-03: cuentas en MXN, saldo exacto y restricciones de integridad', async () => {
  await transaction(async (runner) => {
    const id = await user(runner);
    const clabe = '002010123456789012';
    const rows: Array<{ id: string; balance_cents: string; currency: string; status: string }> =
      await runner.query(
        'INSERT INTO "accounts" ("user_id", "clabe") VALUES ($1,$2) RETURNING "id", "balance_cents", "currency", "status"',
        [id, clabe],
      );
    assert.equal(rows[0]?.balance_cents, '0');
    assert.equal(typeof rows[0]?.balance_cents, 'string');
    assert.equal(rows[0]?.currency.trim(), 'MXN');
    assert.equal(rows[0]?.status, 'ACTIVE');
    await expectPgError(runner,
      'INSERT INTO "accounts" ("user_id", "clabe") VALUES ($1,$2)',
      [id, clabe], '23505');
    await expectPgError(runner,
      'INSERT INTO "accounts" ("user_id", "clabe", "balance_cents") VALUES ($1,$2,$3)',
      [id, '002010123456789013', '-1'], '23514');
    await expectPgError(runner,
      'INSERT INTO "accounts" ("user_id", "clabe", "currency") VALUES ($1,$2,$3)',
      [id, '002010123456789013', 'USD'], '23514');
    await expectPgError(runner,
      'INSERT INTO "accounts" ("user_id", "clabe") VALUES ($1,$2)',
      [id, 'bad-clabe'], '23514');
    await expectPgError(runner,
      'DELETE FROM "accounts" WHERE "id" = $1',
      [rows[0]?.id], '42501');
  });
});

test('T-03: refresh único, FK usuario y rotación referenciada', async () => {
  await transaction(async (runner) => {
    const userId = await user(runner);
    const familyId = randomUUID();
    const hash1 = createHash('sha256').update(randomUUID()).digest('hex');
    const hash2 = createHash('sha256').update(randomUUID()).digest('hex');
    const insert = `INSERT INTO "refresh_tokens" ("user_id", "family_id", "token_hash", "expires_at")
      VALUES ($1,$2,$3,now() + interval '7 days') RETURNING "id"`;
    const first: Array<{ id: string }> = await runner.query(insert, [userId, familyId, hash1]);
    const second: Array<{ id: string }> = await runner.query(insert, [userId, familyId, hash2]);
    const firstId = first[0]?.id;
    const secondId = second[0]?.id;
    assert.ok(firstId && secondId);
    await runner.query(
      'UPDATE "refresh_tokens" SET "revoked_at" = now(), "replaced_by_id" = $1 WHERE "id" = $2',
      [secondId, firstId],
    );
    const rows: Array<{ revoked_at: Date; replaced_by_id: string }> = await runner.query(
      'SELECT "revoked_at", "replaced_by_id" FROM "refresh_tokens" WHERE "id" = $1', [firstId],
    );
    assert.ok(rows[0]?.revoked_at);
    assert.equal(rows[0]?.replaced_by_id, secondId);

    await expectPgError(runner, insert, [userId, familyId, hash1], '23505');
    await expectPgError(runner, insert, [randomUUID(), familyId, hash2 + 'x'], '23503');
    await expectPgError(runner,
      'UPDATE "refresh_tokens" SET "replaced_by_id" = $1 WHERE "id" = $2',
      [randomUUID(), firstId], '23503');
    await expectPgError(runner,
      'UPDATE "refresh_tokens" SET "replaced_by_id" = $1 WHERE "id" = $2',
      [secondId, secondId], '23514');
  });
});
