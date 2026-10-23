import { createDataSource } from '../data-source.js';
import { DEMO, SEED_TRANSFER_COUNT } from './t20-common.js';

/** Output is real PostgreSQL EXPLAIN; copy it unchanged into specs/design.md §5.1. */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !process.argv.includes('--confirm-dev-explain')) {
    throw new Error('EXPLAIN is permitted only on the development seed database');
  }
  const db = createDataSource('app', 'development');
  try {
    const name = db.options.database;
    if (typeof name !== 'string' || name !== process.env.DB_NAME
      || name === process.env.DB_TEST_NAME || /prod|production|test/i.test(name)) {
      throw new Error('Refusing to analyze a non-development database');
    }
    await db.initialize();
    const count = await db.query(`SELECT count(*)::integer AS n FROM ledger_entries le
      JOIN transfers t ON t.id=le.transfer_id
      WHERE t.sender_user_id=$1::uuid AND t.idempotency_key LIKE 't20:v1:%'`,
    [DEMO.userA]) as Array<{n:number}>;
    if (count[0]?.n !== SEED_TRANSFER_COUNT*2) throw new Error('Run verified T-20 seed before EXPLAIN');

    const query = `
      SELECT le.id,le.transfer_id,le.account_id,le.type,le.signed_amount_cents,
             le.created_at, to_char(le.created_at AT TIME ZONE 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,t.concept,t.reference
        FROM ledger_entries le
        JOIN accounts a ON a.id=le.account_id
        JOIN transfers t ON t.id=le.transfer_id
       WHERE a.user_id=$1::uuid
         AND ($2::uuid IS NULL OR le.account_id=$2::uuid)
         AND ($3::text IS NULL OR le.type=$3::text)
         AND ($4::date IS NULL OR le.created_at >= ($4::date::timestamp AT TIME ZONE 'America/Mexico_City'))
         AND ($5::date IS NULL OR le.created_at < (($5::date+1)::timestamp AT TIME ZONE 'America/Mexico_City'))
         AND ($6::timestamptz IS NULL OR (le.created_at,le.id)<($6::timestamptz,$7::uuid))
       ORDER BY le.created_at DESC,le.id DESC
       LIMIT $8::integer`;
    const cases = [
      {name:'account-filtered',params:[DEMO.userA,DEMO.accountA1,null,'2026-01-15','2026-01-15',null,null,21]},
      {name:'owner-only',params:[DEMO.userA,null,null,null,null,null,null,21]},
    ];
    for (const item of cases) {
      const rows = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
        item.params) as Array<{ 'QUERY PLAN': string }>;
      console.log(`\n### T-20 EXPLAIN: ${item.name}\n`);
      console.log(`Rows in seed: ${count[0]!.n}, filter: ${JSON.stringify({userId:item.params[0], accountId:item.params[1], from:item.params[3], to:item.params[4], limit:item.params[7]})}`);
      console.log(rows.map(r => r['QUERY PLAN']).join('\n'));
    }
    console.log('\nPaste the ORIGINAL PostgreSQL output in specs/design.md §5.1; do not invent latencies.');
  } finally {if(db.isInitialized) await db.destroy();}
}
main().catch(error => {
  console.error(JSON.stringify({event:'t20.explain.failed',
    error:error instanceof Error?error.message:'Unknown error'}));
  process.exitCode=1;
});
