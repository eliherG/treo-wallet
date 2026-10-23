import * as argon2 from 'argon2';
import type { EntityManager } from 'typeorm';
import { createDataSource } from '../data-source.js';
import { DEMO, insertSeedBatch, SEED_BATCH_SIZE, SEED_DAY,
  SEED_TRANSFER_COUNT, SEED_VERSION } from './t20-common.js';

/** T-20: development ONLY; do not set NODE_ENV=production or run against treo_test. */
async function ensureFixtures(manager: EntityManager, passwordHash: string): Promise<void> {
  const people = [
    { id: DEMO.userA, name: 'Treo Demo A', email: 'treo-demo-a@seed.invalid' },
    { id: DEMO.userB, name: 'Treo Demo B', email: 'treo-demo-b@seed.invalid' },
  ];
  for (const person of people) {
    await manager.query(`INSERT INTO users(id, name, email_canonical, password_hash)
      VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,
    [person.id,person.name,person.email,passwordHash]);
    const found = await manager.query(`SELECT id,name,email_canonical FROM users WHERE id=$1::uuid`,
      [person.id]) as Array<{id:string;name:string;email_canonical:string}>;
    if (found[0]?.name !== person.name || found[0]?.email_canonical !== person.email) {
      throw new Error('Demo user already exists with unexpected attributes');
    }
  }
  const accounts = [
    {id: DEMO.accountA1, user: DEMO.userA, clabe: DEMO.clabeA1, balance: '1000000'}, // MXN 10,000
    {id: DEMO.accountA2, user: DEMO.userA, clabe: DEMO.clabeA2, balance: '200000'}, // MXN 2,000
    {id: DEMO.accountB1, user: DEMO.userB, clabe: DEMO.clabeB1, balance: '500000'}, // MXN 5,000
  ];
  for (const account of accounts) {
    await manager.query(`INSERT INTO accounts(id,user_id,clabe,currency,balance_cents,status)
      VALUES($1::uuid,$2::uuid,$3,'MXN',$4::bigint,'ACTIVE')
      ON CONFLICT(id) DO NOTHING`,
    [account.id, account.user, account.clabe, account.balance]);
    const found = await manager.query(`SELECT id,user_id,clabe,currency,balance_cents,status FROM accounts
      WHERE id=$1::uuid`, [account.id]) as Array<{
      id:string;user_id:string;clabe:string;currency:string;balance_cents:string;status:string;
    }>;
    if (found[0]?.user_id !== account.user || found[0]?.clabe !== account.clabe
      || found[0]?.currency !== 'MXN' || found[0]?.balance_cents !== account.balance
      || found[0]?.status !== 'ACTIVE') {
      throw new Error('Demo account has been changed; refusing to overwrite balances');
    }
  }
}

async function assertNoOtherUserOperations(manager: EntityManager): Promise<void> {
  const foreign = await manager.query(`SELECT count(*)::integer AS total FROM transfers
      WHERE sender_user_id=$1::uuid AND idempotency_key NOT LIKE 't20:v1:%'`,
    [DEMO.userA]) as Array<{total:number}>;
  if (foreign[0]?.total !== 0) throw new Error('Demo A has non-seed transfers; refusing to continue');
}

async function verify(manager: EntityManager) {
  const summary = await manager.query(`
    SELECT count(DISTINCT t.id)::integer AS transfers,
           count(le.id)::integer AS movements,
           count(le.id) FILTER (WHERE le.type='DEBIT')::integer AS debits,
           count(le.id) FILTER (WHERE le.type='CREDIT')::integer AS credits,
           COALESCE(sum(le.signed_amount_cents),0)::text AS net
      FROM transfers t
      LEFT JOIN ledger_entries le ON le.transfer_id=t.id
     WHERE t.sender_user_id=$1::uuid AND t.idempotency_key LIKE 't20:v1:%'
  `, [DEMO.userA]) as Array<{
    transfers:number; movements:number;debits:number;credits:number;net:string;
  }>;
  const check = summary[0];
  if (check?.transfers !== SEED_TRANSFER_COUNT || check.movements !== 2*SEED_TRANSFER_COUNT
      || check.debits !== SEED_TRANSFER_COUNT || check.credits !== SEED_TRANSFER_COUNT
      || check.net !== '0') throw new Error(`Seed validation failed: ${JSON.stringify(check)}`);
  const quota = await manager.query(`SELECT spent_cents FROM daily_transfer_usage
    WHERE user_id=$1::uuid AND business_date=$2::date`,
  [DEMO.userA,SEED_DAY]) as Array<{spent_cents:string}>;
  if (quota[0]?.spent_cents !== String(SEED_TRANSFER_COUNT)) throw new Error('Incorrect demo daily usage');
  const audit = await manager.query(`SELECT count(*)::integer AS count FROM audit_events
    WHERE actor_user_id=$1::uuid AND metadata_sanitized->>'origin' = 'T20_DEMO_SEED'`,
  [DEMO.userA]) as Array<{count:number}>;
  if (audit[0]?.count !== SEED_TRANSFER_COUNT) throw new Error('Missing demo audit entries');
  const balances = await manager.query(`SELECT id,balance_cents FROM accounts WHERE id=ANY($1::uuid[])`,
  [[DEMO.accountA1,DEMO.accountA2,DEMO.accountB1]]) as Array<{id:string;balance_cents:string}>;
  const amounts = new Map(balances.map(row => [row.id,row.balance_cents]));
  if (amounts.get(DEMO.accountA1) !== '1000000' || amounts.get(DEMO.accountA2) !== '200000'
    || amounts.get(DEMO.accountB1) !== '500000') throw new Error('Demo account balances are not D-02 values');
  return check;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !process.argv.includes('--confirm-dev-seed')) {
    throw new Error('T-20 seed is development-only. Pass --confirm-dev-seed intentionally.');
  }
  const db = createDataSource('migrator', 'development');
  const password = process.env.TREO_SEED_DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set TREO_SEED_DEMO_PASSWORD (12+ chars) in local .env only');
  // Hash the demo password, never store or print the original string.
  const passwordHash = await argon2.hash(password, {type:argon2.argon2id});
  try {
    const name = db.options.database;
    if (typeof name !== 'string' || !name || /test|prod|production/i.test(name) || name !== process.env.DB_NAME
      || name === process.env.DB_TEST_NAME) throw new Error('Refusing non-development or test database');
    await db.initialize();
    await db.transaction('READ COMMITTED', async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${SEED_VERSION}:fixtures`]);
      await ensureFixtures(tx, passwordHash);
      await assertNoOtherUserOperations(tx);
    });
    for (let start=0;start<SEED_TRANSFER_COUNT;start+=SEED_BATCH_SIZE) {
      const result = await db.transaction('READ COMMITTED', tx => insertSeedBatch(tx, {
        userId:DEMO.userA,accountA:DEMO.accountA1,accountB:DEMO.accountA2,
        start,count:SEED_BATCH_SIZE,
      }));
      if (start % 5000 === 0) console.log(JSON.stringify({event:'t20.seed.progress', completed:start+SEED_BATCH_SIZE,
        total:SEED_TRANSFER_COUNT, action:result}));
    }
    const report = await verify(db.manager);
    console.log(JSON.stringify({event:'t20.seed.verified', ...report,
      userA:DEMO.userA,userB:DEMO.userB,
      accounts:[DEMO.accountA1,DEMO.accountA2,DEMO.accountB1],
      businessDate:SEED_DAY }));
  } finally {if (db.isInitialized) await db.destroy();}
}
main().catch(error => {
  console.error(JSON.stringify({event:'t20.seed.failed',
    error:error instanceof Error ? error.message : 'Unknown error'}));
  process.exitCode=1;
});
