import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { QueryRunner } from 'typeorm';
import { createDataSource } from '../data-source.js';
import { BeneficiaryEntity } from '../../modules/beneficiaries/entities/beneficiary.entity.js';

/** All T-04 fixtures are created with the app role on treo_test and rolled back. */
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
  runner: QueryRunner,
  sql: string,
  params: unknown[],
  expectedCode: string,
): Promise<void> {
  // Savepoints keep the surrounding transaction usable after an expected SQL error.
  await runner.query('SAVEPOINT t04_expected_error');
  try {
    await assert.rejects(
      runner.query(sql, params),
      (error: unknown) => isPgCode(error, expectedCode),
    );
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT t04_expected_error');
    await runner.query('RELEASE SAVEPOINT t04_expected_error');
  }
}

async function createUser(runner: QueryRunner): Promise<string> {
  const result: Array<{ id: string }> = await runner.query(
    'INSERT INTO "users" ("name", "email_canonical", "password_hash") VALUES ($1,$2,$3) RETURNING "id"',
    ['Usuario beneficiarios', `t04-${randomUUID()}@example.test`, 'fixture-hash-not-for-auth'],
  );
  const id = result[0]?.id;
  assert.ok(id);
  return id;
}

const insertBeneficiary = `
  INSERT INTO "beneficiaries" ("user_id", "name", "alias", "clabe")
  VALUES ($1,$2,$3,$4)
  RETURNING "id", "user_id", "name", "alias", "clabe", "created_at"
`;

const exampleClabe = '002010123456789012';

test('T-04: TypeORM registra beneficiaries y mantiene synchronize: false', async () => {
  const ds = createDataSource('app', 'test');
  assert.equal(ds.options.synchronize, false);
  await ds.initialize();
  try {
    assert.ok(ds.hasMetadata(BeneficiaryEntity));
    const metadata = ds.getMetadata(BeneficiaryEntity);
    assert.equal(metadata.tableName, 'beneficiaries');
    assert.ok(metadata.foreignKeys.some((key) => key.columns.some((column) => column.databaseName === 'user_id')));
  } finally {
    await ds.destroy();
  }
});

test('T-04: permite la misma CLABE a propietarios distintos y consulta por propietario', async () => {
  await transaction(async (runner) => {
    const ownerA = await createUser(runner);
    const ownerB = await createUser(runner);
    const a: Array<{ id: string; user_id: string; name: string; alias: string; clabe: string; created_at: Date }> =
      await runner.query(insertBeneficiary, [ownerA, 'Beneficiario A', 'Familiar', exampleClabe]);
    const b: Array<{ id: string; user_id: string; name: string; alias: string; clabe: string; created_at: Date }> =
      await runner.query(insertBeneficiary, [ownerB, 'Beneficiario B', 'Contacto', exampleClabe]);
    const beneficiaryA = a[0];
    const beneficiaryB = b[0];
    assert.ok(beneficiaryA && beneficiaryB);
    assert.notEqual(beneficiaryA.id, beneficiaryB.id);
    assert.equal(beneficiaryA.user_id, ownerA);
    assert.equal(beneficiaryB.user_id, ownerB);
    assert.equal(beneficiaryA.clabe, exampleClabe);
    assert.ok(beneficiaryA.created_at);

    const own: Array<{ id: string }> = await runner.query(
      'SELECT "id" FROM "beneficiaries" WHERE "user_id" = $1', [ownerA],
    );
    assert.deepEqual(own.map((r) => r.id), [beneficiaryA.id]);
    // Ownership filtering in API is implemented later in T-12; DB does not provide RLS.
  });
});

test('T-04: rechaza CLABE duplicada por usuario y entradas sin 18 dígitos', async () => {
  await transaction(async (runner) => {
    const ownerId = await createUser(runner);
    await runner.query(insertBeneficiary, [ownerId, 'Beneficiario', 'Casa', exampleClabe]);

    await expectPgError(runner, insertBeneficiary,
      [ownerId, 'Duplicado', 'Otra etiqueta', exampleClabe], '23505');
    await expectPgError(runner, insertBeneficiary,
      [ownerId, 'Inválido', '17 dígitos', '00201012345678901'], '23514');
    await expectPgError(runner, insertBeneficiary,
      [ownerId, 'Inválido', '19 dígitos', '0020101234567890123'], '22001');
    await expectPgError(runner, insertBeneficiary,
      [ownerId, 'Inválido', 'Letra', '00201012345678901A'], '23514');
    await expectPgError(runner, insertBeneficiary,
      [ownerId, null, 'Sin nombre', '002010123456789013'], '23502');
  });
});

test('T-04: FK del propietario y permisos restringidos del rol app', async () => {
  await transaction(async (runner) => {
    await expectPgError(runner, insertBeneficiary,
      [randomUUID(), 'Huérfano', 'No user', exampleClabe], '23503');

    const ownerId = await createUser(runner);
    const rows: Array<{ id: string }> = await runner.query(insertBeneficiary,
      [ownerId, 'Válido', 'Amigo', exampleClabe]);
    const beneficiary = rows[0];
    assert.ok(beneficiary);
    await expectPgError(runner,
      'DELETE FROM "beneficiaries" WHERE "id" = $1', [beneficiary.id], '42501');
  });
});
