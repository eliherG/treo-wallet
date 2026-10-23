/** T-19 isolated test utilities. Never import into production application code. */
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import type { SubmitTransferInput } from '../atomic-transfer.service.js';

export type TestWallet = {
  userId: string;
  sourceId: string;
  sourceClabe: string;
  destinationId: string;
  destinationClabe: string;
  openingSourceCents: bigint;
};

export function assertTestDatabase(app: DataSource, migrator: DataSource): void {
  // Require an explicit, dedicated database name. Never run on development data.
  if (app.options.database !== 'treo_test' || migrator.options.database !== 'treo_test' ||
    app.options.database === process.env.DB_NAME || process.env.NODE_ENV === 'production') {
    throw new Error('T-19 is restricted to dedicated treo_test (different from DB_NAME)');
  }
}

export async function createTestWallet(
  app: DataSource,
  migrator: DataSource,
  label: string,
  openingSourceCents: bigint,
): Promise<TestWallet> {
  if (openingSourceCents < 0n || openingSourceCents > 9_223_372_036_854_775_807n) {
    throw new RangeError('Unsafe test balance');
  }
  const auth = new AuthService(app, new AccessTokens('t19-only-local-tests-not-production-abcdefghijklm'));
  const registered = await auth.register({
    name: 'T19 Synthetic User',
    email: `t19-${label}-${randomUUID()}@treo.test`,
    password: 'T19-Only-Test-Password-123!',
  });
  const userId = registered.user.id;
  const repo = app.getRepository(AccountEntity);
  const source = await repo.findOneByOrFail({ userId });
  const destination = await repo.save(repo.create({
    userId,
    clabe: generateDemoClabe(),
    currency: 'MXN',
    status: 'ACTIVE',
    balanceCents: '0',
  }));
  // Test-only privileged setup, never used by the application service.
  await migrator.query('UPDATE accounts SET balance_cents = $2::bigint WHERE id = $1',
    [source.id, openingSourceCents.toString()]);
  return {
    userId, sourceId: source.id, sourceClabe: source.clabe,
    destinationId: destination.id, destinationClabe: destination.clabe,
    openingSourceCents,
  };
}

export function ownTransfer(
  wallet: TestWallet,
  amount: string,
  idempotencyKey = randomUUID(),
): SubmitTransferInput {
  return {
    authenticatedUserId: wallet.userId,
    idempotencyKey,
    requestId: randomUUID(),
    payload: {
      sourceAccountId: wallet.sourceId,
      destinationAccountId: wallet.destinationId,
      amount,
      concept: 'T19 prueba de integridad',
      reference: '000019',
    },
  };
}

export async function runTogether<T>(jobs: Array<() => Promise<T>>): Promise<T[]> {
  // Wait for ALL requests, even if some fail: do not close the DB pool while
  // concurrent transactions remain in flight.
  const settled = await Promise.allSettled(jobs.map((job) => job()));
  const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(x => x.reason),
    `${failures.length} T19 concurrent database operations rejected`);
  return settled.map(item => (item as PromiseFulfilledResult<T>).value);
}

export async function runBounded<T>(jobs: Array<() => Promise<T>>, parallel = 16): Promise<T[]> {
  const results = new Array<T>(jobs.length);
  const failures: unknown[] = [];
  let position = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    while (position < jobs.length) {
      const current = position++;
      try { results[current] = await jobs[current]!(); }
      catch (error) { failures.push(error); }
    }
  }));
  if (failures.length) throw new AggregateError(failures,
    `${failures.length} T19 bounded database operations rejected`);
  return results;
}

export async function walletBalances(app: DataSource, wallet: TestWallet): Promise<[bigint, bigint]> {
  const rows = await app.query(
    'SELECT id, balance_cents FROM accounts WHERE id = ANY($1::uuid[])',
    [[wallet.sourceId, wallet.destinationId]],
  ) as Array<{ id: string; balance_cents: string }>;
  const map = new Map(rows.map((row) => [row.id, BigInt(row.balance_cents)]));
  const source = map.get(wallet.sourceId);
  const dest = map.get(wallet.destinationId);
  if (source === undefined || dest === undefined) throw new Error('Missing wallet account');
  return [source, dest];
}

export async function reconcileSender(app: DataSource, userId: string): Promise<{
  completed: number;
  rejected: number;
  other: number;
  entries: number;
  audits: number;
  net: bigint;
  outflow: bigint;
}> {
  const summary = await app.query(`
    SELECT
      COUNT(*) FILTER (WHERE status='COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','REJECTED'))::int AS other
    FROM transfers WHERE sender_user_id=$1
  `, [userId]) as Array<{ completed:number; rejected:number; other:number }>;
  const ledger = await app.query(`
    SELECT COUNT(le.id)::int AS entries,
           COALESCE(SUM(le.signed_amount_cents),0)::text AS net,
           COALESCE(SUM(-le.signed_amount_cents) FILTER (WHERE le.type='DEBIT'),0)::text AS outflow
      FROM transfers t LEFT JOIN ledger_entries le ON le.transfer_id=t.id
     WHERE t.sender_user_id=$1
  `, [userId]) as Array<{entries:number;net:string;outflow:string}>;
  const audit = await app.query(`
    SELECT COUNT(ae.id)::int AS n FROM audit_events ae
    JOIN transfers t ON t.id=ae.transfer_id
    WHERE t.sender_user_id=$1 AND ae.action='TRANSFER_COMPLETED'
  `, [userId]) as Array<{n:number}>;
  const faults = await app.query(`
    SELECT t.id, t.status, COUNT(le.id)::int AS entries,
           COALESCE(SUM(le.signed_amount_cents),0)::text AS net,
           COUNT(*) FILTER(WHERE le.type='DEBIT')::int AS debits,
           COUNT(*) FILTER(WHERE le.type='CREDIT')::int AS credits
      FROM transfers t LEFT JOIN ledger_entries le ON le.transfer_id=t.id
     WHERE t.sender_user_id=$1
     GROUP BY t.id,t.status
     HAVING (t.status='COMPLETED' AND
         (COUNT(le.id)<>2 OR COUNT(*) FILTER(WHERE le.type='DEBIT')<>1 OR
          COUNT(*) FILTER(WHERE le.type='CREDIT')<>1 OR
          COALESCE(SUM(le.signed_amount_cents),0)<>0))
        OR (t.status<>'COMPLETED' AND COUNT(le.id)<>0)
  `,[userId]) as unknown[];
  if (faults.length) throw new Error(`T19 reconciliation: ${faults.length} inconsistent transfers`);
  return {
    completed:summary[0]?.completed??0,
    rejected:summary[0]?.rejected??0,
    other:summary[0]?.other??0,
    entries:ledger[0]?.entries??0,
    audits:audit[0]?.n??0,
    net:BigInt(ledger[0]?.net??'0'),
    outflow:BigInt(ledger[0]?.outflow??'0'),
  };
}

export async function accountLedgerNet(app: DataSource, ids: string[]): Promise<Map<string,bigint>> {
  const rows = await app.query(`
    SELECT a.id, COALESCE(SUM(le.signed_amount_cents),0)::text AS net
    FROM accounts a LEFT JOIN ledger_entries le ON le.account_id=a.id
    WHERE a.id=ANY($1::uuid[]) GROUP BY a.id
  `,[ids]) as Array<{id:string;net:string}>;
  return new Map(rows.map(row=>[row.id,BigInt(row.net)]));
}
