import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { EntityManager } from 'typeorm';
import { createDataSource } from '../../../database/data-source.js';
import { HttpProblem } from '../../../http/http-problem.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { UserEntity } from '../../auth/entities/user.entity.js';
import { BeneficiaryEntity } from '../../beneficiaries/entities/beneficiary.entity.js';
import { validateTransferInstruction } from '../validation.js';

const db = createDataSource('app', 'test');
const financialTables = [
  'accounts', 'transfers', 'ledger_entries', 'daily_transfer_usage',
  'otp_challenges', 'audit_events',
];

before(async () => {
  assert.ok(process.env.DB_NAME, 'DB_NAME must identify the development database');
  assert.ok(process.env.DB_TEST_NAME, 'DB_TEST_NAME must identify the test database');
  assert.equal(process.env.DB_TEST_NAME, 'treo_test', 'T-13 fixtures are restricted to treo_test');
  assert.notEqual(process.env.DB_TEST_NAME, process.env.DB_NAME,
    'T-13 integration tests must never target the development database');
  await db.initialize();
  const identity: Array<{ database: string; role: string }> = await db.query(
    'SELECT current_database() AS database, current_user AS role',
  );
  assert.deepEqual(identity, [{ database: process.env.DB_TEST_NAME, role: 'treo_app' }]);
});

after(async () => {
  if (db.isInitialized) await db.destroy();
});

async function createFixture(manager: EntityManager) {
  const users = manager.getRepository(UserEntity);
  const owner = await users.save(users.create({
    name: 'Usuario T13', emailCanonical: `t13-owner-${randomUUID()}@treo.test`,
    passwordHash: 'fixture-hash-not-for-auth',
  }));
  const other = await users.save(users.create({
    name: 'Otro usuario T13', emailCanonical: `t13-other-${randomUUID()}@treo.test`,
    passwordHash: 'fixture-hash-not-for-auth',
  }));
  const accounts = manager.getRepository(AccountEntity);
  async function account(userId: string, status = 'ACTIVE') {
    return accounts.save(accounts.create({
      userId, clabe: generateDemoClabe(), status, currency: 'MXN', balanceCents: '0',
    }));
  }
  const source = await account(owner.id);
  const ownDestination = await account(owner.id);
  const blockedOwn = await account(owner.id, 'BLOCKED');
  const otherDestination = await account(other.id);
  const blockedOther = await account(other.id, 'BLOCKED');
  const inactiveOwn = await account(owner.id, 'INACTIVE');
  const beneficiaries = manager.getRepository(BeneficiaryEntity);
  async function beneficiary(userId: string, clabe: string) {
    return beneficiaries.save(beneficiaries.create({
      userId, clabe, name: 'Beneficiario T13', alias: 'Prueba',
    }));
  }
  const internal = await beneficiary(owner.id, otherDestination.clabe);
  const own = await beneficiary(owner.id, ownDestination.clabe);
  const self = await beneficiary(owner.id, source.clabe);
  const blocked = await beneficiary(owner.id, blockedOther.clabe);
  const foreign = await beneficiary(other.id, otherDestination.clabe);
  const external = await beneficiary(owner.id, generateDemoClabe());
  assert.equal(await accounts.existsBy({ clabe: external.clabe }), false);
  const prefix = generateDemoClabe();
  const invalidClabe = `${prefix.slice(0, -1)}${prefix.endsWith('0') ? '1' : '0'}`;
  // PostgreSQL enforces 18 digits; T-13 must also check the stored checksum.
  const invalid = await beneficiary(owner.id, invalidClabe);
  return {
    owner, other, source, ownDestination, blockedOwn, otherDestination,
    blockedOther, inactiveOwn, internal, own, self, blocked, foreign, external, invalid,
  };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function financialSnapshot(manager: EntityManager, fixture: Fixture) {
  const balances: Array<{ id: string; balance_cents: string }> = await manager.query(
    `SELECT id, balance_cents::text FROM accounts
     WHERE user_id = ANY($1::uuid[]) ORDER BY id`, [
      [fixture.owner.id, fixture.other.id],
    ],
  );
  // Transaction-local counters detect INSERT/UPDATE/DELETE, even for rows outside
  // these fixtures. No full-ledger scan or financial writes are needed.
  const mutations: Array<{
    relname: string; inserted: string; updated: string; deleted: string;
  }> = await manager.query(
    `SELECT relname, n_tup_ins::text AS inserted, n_tup_upd::text AS updated,
            n_tup_del::text AS deleted
     FROM pg_stat_xact_user_tables
     WHERE schemaname = 'public' AND relname = ANY($1::text[])
     ORDER BY relname`, [financialTables],
  );
  assert.deepEqual(mutations.map((row) => row.relname), [...financialTables].sort());
  return { balances, mutations };
}

async function withFixture(
  run: (manager: EntityManager, fixture: Fixture) => Promise<void>,
): Promise<void> {
  const runner = db.createQueryRunner();
  let fixture: Fixture | undefined;
  try {
    await runner.connect();
    await runner.startTransaction('REPEATABLE READ');
    fixture = await createFixture(runner.manager);
    const initial = await financialSnapshot(runner.manager, fixture);
    assert.ok(initial.balances.every((account) => account.balance_cents === '0'));
    await run(runner.manager, fixture);
    assert.deepEqual(await financialSnapshot(runner.manager, fixture), initial,
      'Validation must not modify balances, transfers, ledger, daily usage, OTP or audit');
  } finally {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }
    if (fixture) {
      const remaining: Array<{ id: string }> = await db.query(
        'SELECT id FROM users WHERE id = ANY($1::uuid[])',
        [[fixture.owner.id, fixture.other.id]],
      );
      assert.deepEqual(remaining, [], 'All temporary fixtures must have rolled back');
    }
  }
}

function ownRequest(fixture: Fixture) {
  return {
    sourceAccountId: fixture.source.id,
    destinationAccountId: fixture.ownDestination.id,
    amount: '150.25', concept: '  Pago de prueba  ', reference: '0001234',
  };
}

function beneficiaryRequest(fixture: Fixture, beneficiaryId = fixture.internal.id) {
  return {
    sourceAccountId: fixture.source.id, beneficiaryId,
    amount: '0.01', concept: 'Pago de prueba', reference: '0000000',
  };
}

async function rejection(
  manager: EntityManager, fixture: Fixture, input: unknown, status: number, code: string,
) {
  let caught: HttpProblem | undefined;
  await assert.rejects(validateTransferInstruction(manager, fixture.owner.id, input), (error: unknown) => {
    assert.ok(error instanceof HttpProblem);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    caught = error;
    return true;
  });
  assert.ok(caught);
  const publicProblem = {
    status: caught.status, code: caught.code, title: caught.title, detail: caught.publicDetail,
  };
  const publicText = JSON.stringify(publicProblem);
  for (const entity of Object.values(fixture)) {
    assert.equal(publicText.includes(entity.id), false);
    if ('clabe' in entity) assert.equal(publicText.includes(entity.clabe), false);
    if ('emailCanonical' in entity) assert.equal(publicText.includes(entity.emailCanonical), false);
  }
  assert.doesNotMatch(publicText, /SELECT\s|INSERT\s|UPDATE\s|DELETE\s|QueryFailedError|password_hash/i);
  return publicProblem;
}

test('T-13 CA-RF07-01: resuelve dos cuentas propias sin consultar fondos ni mover dinero', async () => {
  await withFixture(async (manager, fixture) => {
    const result = await validateTransferInstruction(manager, fixture.owner.id, ownRequest(fixture));
    assert.deepEqual(result, {
      kind: 'OWN_ACCOUNTS', sourceAccountId: fixture.source.id,
      destinationAccountId: fixture.ownDestination.id, beneficiaryId: null,
      amountCents: 15025n, concept: 'Pago de prueba', reference: '0001234',
    });
  });
});

test('T-13 CA-RF06-01: beneficiario propio resuelve por CLABE una cuenta de otro usuario', async () => {
  await withFixture(async (manager, fixture) => {
    const result = await validateTransferInstruction(manager, fixture.owner.id, beneficiaryRequest(fixture));
    assert.deepEqual(result, {
      kind: 'BENEFICIARY', sourceAccountId: fixture.source.id,
      destinationAccountId: fixture.otherDestination.id, beneficiaryId: fixture.internal.id,
      amountCents: 1n, concept: 'Pago de prueba', reference: '0000000',
    });
  });
});

test('T-13: beneficiario hacia otra cuenta propia conserva la instrucción válida', async () => {
  await withFixture(async (manager, fixture) => {
    const result = await validateTransferInstruction(manager, fixture.owner.id,
      beneficiaryRequest(fixture, fixture.own.id));
    assert.equal(result.kind, 'BENEFICIARY');
    assert.equal(result.destinationAccountId, fixture.ownDestination.id);
  });
});

test('T-13 CA-RF06-03/CA-RF07-03: inexistentes y ajenos son indistinguibles en 403', async () => {
  await withFixture(async (manager, fixture) => {
    const inputs = [
      { ...ownRequest(fixture), sourceAccountId: randomUUID() },
      { ...ownRequest(fixture), sourceAccountId: fixture.otherDestination.id },
      { ...ownRequest(fixture), sourceAccountId: fixture.blockedOther.id },
      { ...ownRequest(fixture), destinationAccountId: randomUUID() },
      { ...ownRequest(fixture), destinationAccountId: fixture.otherDestination.id },
      { ...ownRequest(fixture), destinationAccountId: fixture.blockedOther.id },
      beneficiaryRequest(fixture, randomUUID()),
      beneficiaryRequest(fixture, fixture.foreign.id),
    ];
    const expected = await rejection(manager, fixture, inputs[0], 403, 'RESOURCE_UNAVAILABLE');
    for (const input of inputs.slice(1)) {
      assert.deepEqual(await rejection(manager, fixture, input, 403, 'RESOURCE_UNAVAILABLE'), expected);
    }
  });
});

test('T-13 CA-RF06-03: destinos externos y CLABE almacenada inválida se rechazan', async () => {
  await withFixture(async (manager, fixture) => {
    const external = await rejection(manager, fixture,
      beneficiaryRequest(fixture, fixture.external.id), 422, 'INVALID_TRANSFER_INSTRUCTION');
    const invalid = await rejection(manager, fixture,
      beneficiaryRequest(fixture, fixture.invalid.id), 422, 'INVALID_TRANSFER_INSTRUCTION');
    assert.deepEqual(invalid, external);
  });
});

test('T-13 CA-RF07-02: rechaza la misma cuenta directa y resuelta por beneficiario', async () => {
  await withFixture(async (manager, fixture) => {
    const direct = await rejection(manager, fixture,
      { ...ownRequest(fixture), destinationAccountId: fixture.source.id }, 422, 'INVALID_TRANSFER_INSTRUCTION');
    assert.deepEqual(await rejection(manager, fixture,
      beneficiaryRequest(fixture, fixture.self.id), 422, 'INVALID_TRANSFER_INSTRUCTION'), direct);
  });
});

test('T-13: origen y destinos BLOCKED o distintos de ACTIVE se rechazan', async () => {
  await withFixture(async (manager, fixture) => {
    const inputs = [
      { ...ownRequest(fixture), sourceAccountId: fixture.blockedOwn.id },
      { ...ownRequest(fixture), destinationAccountId: fixture.blockedOwn.id },
      { ...ownRequest(fixture), sourceAccountId: fixture.inactiveOwn.id },
      { ...ownRequest(fixture), destinationAccountId: fixture.inactiveOwn.id },
      beneficiaryRequest(fixture, fixture.blocked.id),
    ];
    for (const input of inputs) {
      await rejection(manager, fixture, input, 422, 'INVALID_TRANSFER_INSTRUCTION');
    }
  });
});

test('T-13: userId e isInternal del cliente y destinos ambiguos producen 400 sin efectos', async () => {
  await withFixture(async (manager, fixture) => {
    const inputs = [
      { ...ownRequest(fixture), userId: fixture.other.id },
      { ...beneficiaryRequest(fixture, fixture.external.id), isInternal: true },
      { ...ownRequest(fixture), beneficiaryId: fixture.internal.id },
      { ...ownRequest(fixture), destinationAccountId: undefined },
      { ...ownRequest(fixture), amount: '0' },
      { ...ownRequest(fixture), amount: '1.001' },
      { ...ownRequest(fixture), concept: '   ' },
      { ...ownRequest(fixture), reference: 1234 },
    ];
    for (const input of inputs) await rejection(manager, fixture, input, 400, 'INVALID_REQUEST');
  });
});

test('T-13 CA-RF06-05: D-04 aplica trim y longitud Unicode igual a PostgreSQL', async () => {
  await withFixture(async (manager, fixture) => {
    for (const concept of ['😀'.repeat(140), 'e\u0301'.repeat(70), 'Pago 🪙']) {
      const result = await validateTransferInstruction(manager, fixture.owner.id,
        { ...ownRequest(fixture), concept: ` \t${concept}\n ` });
      assert.equal(result.concept, concept);
      const lengths: Array<{ length: number }> = await manager.query(
        'SELECT char_length($1::text) AS length', [result.concept],
      );
      assert.equal(lengths[0]?.length, [...concept].length);
    }
    await rejection(manager, fixture,
      { ...ownRequest(fixture), concept: '😀'.repeat(141) }, 400, 'INVALID_REQUEST');
  });
});

test('T-13: importe BIGINT máximo se representa sin crear transferencias, ledger, cupos, OTP ni auditoría', async () => {
  await withFixture(async (manager, fixture) => {
    const result = await validateTransferInstruction(manager, fixture.owner.id,
      { ...ownRequest(fixture), amount: '92233720368547758.07' });
    assert.equal(result.amountCents, 9223372036854775807n);
    const postgres: Array<{ cents: string }> = await manager.query(
      'SELECT $1::bigint::text AS cents', [result.amountCents.toString()],
    );
    assert.deepEqual(postgres, [{ cents: '9223372036854775807' }]);
    await rejection(manager, fixture,
      { ...ownRequest(fixture), amount: '92233720368547758.08' }, 400, 'INVALID_REQUEST');
  });
});
