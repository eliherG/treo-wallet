import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { clabeCheckDigit } from '../../modules/beneficiaries/clabe.js';
import { hashTransferPayload } from '../../modules/transfers/idempotency.js';

export const SEED_VERSION = 't20:v1';
export const SEED_TRANSFER_COUNT = 50_000; // Two ledger lines each = 100,000 movements.
export const SEED_BATCH_SIZE = 250; // Keep deferred trigger workload bounded per COMMIT.
export const SEED_DAY = '2026-01-15';
export const SEED_BASE_TIMESTAMP = '2026-01-15 12:00:00+00';

// RFC 4122-compatible, deterministic IDs. These IDs are exclusively for seed fixtures.
export function fixtureUuid(key: string): string {
  const hex = createHash('sha256').update(`${SEED_VERSION}:${key}`, 'utf8').digest('hex').slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-${((parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function fixtureClabe(counter: number): string {
  if (!Number.isInteger(counter) || counter < 0 || counter > 99_999_999_999_999) throw new RangeError('Invalid demo account index');
  const first17 = `999${String(counter).padStart(14, '0')}`;
  return first17 + clabeCheckDigit(first17);
}
export const DEMO = {
  userA: fixtureUuid('user:A'), userB: fixtureUuid('user:B'),
  accountA1: fixtureUuid('account:A1'), accountA2: fixtureUuid('account:A2'),
  accountB1: fixtureUuid('account:B1'),
  clabeA1: fixtureClabe(20_202_001), clabeA2: fixtureClabe(20_202_002),
  clabeB1: fixtureClabe(20_202_003),
} as const;

export type SeedMovement = { i: number; id: string; fingerprint: string };
export function seedMovements(start: number, count: number, accounts = {
  a: DEMO.accountA1, b: DEMO.accountA2,
}): SeedMovement[] {
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1
    || count > SEED_BATCH_SIZE || start % 2 !== 0 || count % 2 !== 0) {
    throw new RangeError('Seed batches require aligned even start/count');
  }
  return Array.from({ length: count }, (_, step) => {
    const i = start + step;
    const source = i % 2 === 0 ? accounts.a : accounts.b;
    const destination = i % 2 === 0 ? accounts.b : accounts.a;
    return { i, id: fixtureUuid(`transfer:${i}`),
      fingerprint: hashTransferPayload({ kind: 'OWN_ACCOUNTS', sourceAccountId: source,
        destinationAccountId: destination, amountCents: 1n, concept: 'T20 demo movement',
        reference: '0000001' }),
    };
  });
}

/**
 * Seed exactly one atomic batch. Balanced pairs net to zero for each account;
 * materialized balances therefore remain at D-02 initial funding. Daily quota
 * grows by count cents, and every COMPLETED transfer has two ledger entries.
 * DO NOT call on a production database or arbitrary accounts.
 */
export async function insertSeedBatch(manager: EntityManager, input: {
  userId: string; accountA: string; accountB: string; start: number; count: number;
}): Promise<'CREATED' | 'EXISTS'> {
  const { userId, accountA, accountB, start, count } = input;
  const values = seedMovements(start, count, { a: accountA, b: accountB });
  const ids = values.map(item => item.id);
  // Serialized by explicit row lock to avoid two invocations racing on quota.
  const locked = await manager.query('SELECT id FROM users WHERE id = $1::uuid FOR UPDATE', [userId]) as unknown[];
  if (locked.length !== 1) throw new Error('Seed owner missing');
  const rows = await manager.query(`
    SELECT id, status, kind, amount_cents, source_account_id, destination_account_id,
           idempotency_key, payload_hash
      FROM transfers WHERE id = ANY($1::uuid[])
  `, [ids]) as Array<{ id:string;status:string;kind:string;amount_cents:string;
    source_account_id:string;destination_account_id:string;idempotency_key:string;payload_hash:string }>;
  if (rows.length === count) {
    const known = new Map(values.map(v => [v.id, v]));
    for (const row of rows) {
      const expected = known.get(row.id);
      const src = expected!.i % 2 === 0 ? accountA : accountB;
      const dst = expected!.i % 2 === 0 ? accountB : accountA;
      if (row.status !== 'COMPLETED' || row.kind !== 'OWN_ACCOUNTS' || row.amount_cents !== '1'
        || row.source_account_id !== src || row.destination_account_id !== dst
        || row.idempotency_key !== `${SEED_VERSION}:${expected!.i}`
        || row.payload_hash !== expected!.fingerprint) {
        throw new Error('An existing seed transfer differs from the approved fixture');
      }
    }
    const ledger = await manager.query(`SELECT count(*)::integer AS total FROM ledger_entries
      WHERE transfer_id = ANY($1::uuid[])`, [ids]) as Array<{total:number}>;
    if (ledger[0]?.total !== count * 2) throw new Error('Existing seed ledger incomplete');
    return 'EXISTS';
  }
  if (rows.length > 0) throw new Error('Incomplete seed batch: stop and investigate, do not overwrite ledger');

  // Use a parameterized JSONB record set, not 250 individual INSERT round trips.
  const result = await manager.query(`
    WITH raw AS (
      SELECT i, id::uuid, fingerprint
        FROM jsonb_to_recordset($1::jsonb) AS j(i integer, id text, fingerprint text)
    )
    INSERT INTO transfers (
      id, sender_user_id, source_account_id, destination_account_id,
      beneficiary_id, kind, amount_cents, concept, reference,
      idempotency_key, payload_hash, status, requires_otp, created_at, completed_at
    )
    SELECT r.id, $2::uuid,
           CASE WHEN (r.i % 2) = 0 THEN $3::uuid ELSE $4::uuid END,
           CASE WHEN (r.i % 2) = 0 THEN $4::uuid ELSE $3::uuid END,
           NULL, 'OWN_ACCOUNTS', 1::bigint, 'T20 demo movement', '0000001',
           't20:v1:' || r.i::text, r.fingerprint, 'COMPLETED', false,
           $5::timestamptz + r.i * interval '1 microsecond',
           $5::timestamptz + r.i * interval '1 microsecond'
      FROM raw r
    RETURNING id
  `, [JSON.stringify(values), userId, accountA, accountB, SEED_BASE_TIMESTAMP]) as Array<{id:string}>;
  if (result.length !== count) throw new Error('Expected all seed transfer records to insert');

  await manager.query(`
    INSERT INTO ledger_entries (transfer_id, account_id, type, signed_amount_cents, created_at)
    SELECT t.id, t.source_account_id, 'DEBIT', -1::bigint, t.completed_at
      FROM transfers t WHERE t.id = ANY($1::uuid[])
    UNION ALL
    SELECT t.id, t.destination_account_id, 'CREDIT', 1::bigint, t.completed_at
      FROM transfers t WHERE t.id = ANY($1::uuid[])
  `, [ids]);
  await manager.query(`
    INSERT INTO daily_transfer_usage(user_id,business_date,spent_cents)
    VALUES($1::uuid,$2::date,$3::bigint)
    ON CONFLICT(user_id,business_date)
    DO UPDATE SET spent_cents = daily_transfer_usage.spent_cents + EXCLUDED.spent_cents
  `, [userId, SEED_DAY, String(count)]);
  await manager.query(`
    INSERT INTO audit_events (actor_user_id, transfer_id, action, metadata_sanitized, created_at)
    SELECT $2::uuid, t.id, 'TRANSFER_COMPLETED',
           jsonb_build_object('origin','T20_DEMO_SEED','amountCents','1'),t.completed_at
      FROM transfers t WHERE t.id = ANY($1::uuid[])
  `, [ids, userId]);
  // Account A1 and A2 have identical net debits/credits due to even pairs.
  // Never make privileged balance updates for completed ledger rows.
  return 'CREATED';
}
