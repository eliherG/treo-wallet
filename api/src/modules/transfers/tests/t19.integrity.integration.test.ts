import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createDataSource } from '../../../database/data-source.js';
import { AtomicTransferService } from '../atomic-transfer.service.js';
import {
  assertTestDatabase, createTestWallet, ownTransfer, walletBalances,
  type TestWallet,
} from './t19-fixtures.js';

// SAFE regression tests: all actual transfers are inside rollback-only transactions.
const db = createDataSource('app', 'test');
const migrator = createDataSource('migrator', 'test');
const service = new AtomicTransferService(db);
const users: string[] = [];
const ROLLBACK = Symbol('T19 rollback-only fixture');

before(async () => {
  assertTestDatabase(db, migrator);
  await db.initialize();
  await migrator.initialize();
});

after(async () => {
  try {
    if (users.length && migrator.isInitialized) {
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id=ANY($1::uuid[])', [users]);
      await migrator.query('DELETE FROM accounts WHERE user_id=ANY($1::uuid[])', [users]);
      await migrator.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
    }
  } finally {
    if (db.isInitialized) await db.destroy();
    if (migrator.isInitialized) await migrator.destroy();
  }
});

async function fixture(balance: bigint): Promise<TestWallet> {
  const wallet = await createTestWallet(db, migrator, 'safe', balance);
  users.push(wallet.userId);
  return wallet;
}

async function rollbackOnly(run: (tx: Parameters<typeof service.submitInTransaction>[0]) => Promise<void>): Promise<void> {
  await assert.rejects(db.transaction('READ COMMITTED', async (tx) => {
    await run(tx);
    throw ROLLBACK;
  }), (err: unknown) => err === ROLLBACK);
}

function pgGuard(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const wrapped = error as { code?: unknown; driverError?: {code?: unknown} };
  const code = wrapped.driverError?.code ?? wrapped.code;
  return code === '42501' || code === '23514';
}

test('T-19 SAFE: transferencia exacta, balance/ledger/cupo/auditoría y rollback', async () => {
  const f = await fixture(12_345n);
  await rollbackOnly(async tx => {
    const result = await service.submitInTransaction(tx, ownTransfer(f, '12.34'));
    assert.equal(result.outcome, 'COMPLETED');
    if (result.outcome !== 'COMPLETED') throw new Error('Expected completed');
    const accounts = await tx.query('SELECT id,balance_cents FROM accounts WHERE id=ANY($1::uuid[])',
      [[f.sourceId, f.destinationId]]) as Array<{id:string;balance_cents:string}>;
    const map = new Map(accounts.map(row=>[row.id,BigInt(row.balance_cents)]));
    assert.equal(map.get(f.sourceId),11_111n);
    assert.equal(map.get(f.destinationId),1_234n);
    const entries = await tx.query(`SELECT type,signed_amount_cents FROM ledger_entries WHERE transfer_id=$1`,
      [result.transfer.id]) as Array<{type:string;signed_amount_cents:string}>;
    assert.deepEqual(entries.map(x=>[x.type,x.signed_amount_cents]).sort(),
      [['CREDIT','1234'],['DEBIT','-1234']]);
    const usage = await tx.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',
      [f.userId]) as Array<{spent_cents:string}>;
    assert.equal(usage[0]?.spent_cents,'1234');
    const audits = await tx.query('SELECT id FROM audit_events WHERE transfer_id=$1',
      [result.transfer.id]) as unknown[];
    assert.equal(audits.length,1);
  });
  assert.deepEqual(await walletBalances(db,f),[12_345n,0n]);
  const transfers = await db.query('SELECT id FROM transfers WHERE sender_user_id=$1',[f.userId]) as unknown[];
  assert.equal(transfers.length,0,'rolled-back ledger and intent must not survive');
});

test('T-19 SAFE: débito insuficiente REJECTED y replay sin ledger ni cupo', async () => {
  const f = await fixture(99n);
  await rollbackOnly(async tx=>{
    const input=ownTransfer(f,'1.00');
    const first=await service.submitInTransaction(tx,input);
    const second=await service.submitInTransaction(tx,input);
    assert.equal(first.outcome,'ERROR');
    assert.equal(second.outcome,'ERROR');
    if(first.outcome !== 'ERROR'||second.outcome !== 'ERROR') throw Error('Expected rejections');
    assert.equal(first.problem.code,'INSUFFICIENT_FUNDS');
    assert.equal(second.problem.code,'INSUFFICIENT_FUNDS');
    const data = await tx.query(`SELECT t.status, COUNT(le.id)::int AS n FROM transfers t
      LEFT JOIN ledger_entries le ON le.transfer_id=t.id
      WHERE t.sender_user_id=$1 GROUP BY t.id`,[f.userId]) as Array<{status:string;n:number}>;
    assert.equal(data.length,1);
    assert.equal(data[0]?.status,'REJECTED');
    assert.equal(data[0]?.n,0);
    const usage=await tx.query('SELECT user_id FROM daily_transfer_usage WHERE user_id=$1',[f.userId]) as unknown[];
    assert.equal(usage.length,0);
  });
  assert.deepEqual(await walletBalances(db,f),[99n,0n]);
});

test('T-19 SAFE: fallo posterior a débito y auditoría revierte TODA la operación', async()=>{
  const f=await fixture(25_000n);
  const forced=new Error('T19 simulated failure before commit');
  await assert.rejects(db.transaction('READ COMMITTED', async tx=>{
    const result=await service.submitInTransaction(tx,ownTransfer(f,'20.00'));
    assert.equal(result.outcome,'COMPLETED');
    throw forced;
  }),err=>err===forced);
  assert.deepEqual(await walletBalances(db,f),[25_000n,0n]);
  const counts=await db.query(`SELECT
    (SELECT COUNT(*) FROM transfers WHERE sender_user_id=$1)::int AS transfers,
    (SELECT COUNT(*) FROM daily_transfer_usage WHERE user_id=$1)::int AS quota,
    (SELECT COUNT(*) FROM audit_events WHERE actor_user_id=$1)::int AS audits`,
  [f.userId]) as Array<{transfers:number;quota:number;audits:number}>;
  assert.deepEqual(counts[0],{transfers:0,quota:0,audits:0});
});

test('T-19 SAFE: falla inducida entre débito y crédito no deja saldo parcial',async()=>{
  const f=await fixture(1_000n);
  const injected=new Error('T19 abort after debit before credit');
  await assert.rejects(db.transaction('READ COMMITTED',async tx=>{
    await tx.query(`UPDATE accounts SET balance_cents=balance_cents-100::bigint
      WHERE id=$1`,[f.sourceId]);
    const changed=await tx.query('SELECT balance_cents FROM accounts WHERE id=$1',[f.sourceId]) as Array<{balance_cents:string}>;
    assert.equal(changed[0]?.balance_cents,'900');
    // Intentionally NO credit and NO transfer. PostgreSQL must roll back.
    throw injected;
  }),err=>err===injected);
  assert.deepEqual(await walletBalances(db,f),[1_000n,0n]);
});

test('T-19 SAFE: rol app no puede mutar ledger ni auditoría, incluso antes de COMMIT',async()=>{
  const f=await fixture(1_000n);
  await assert.rejects(db.transaction('READ COMMITTED',async tx=>{
    const r=await service.submitInTransaction(tx,ownTransfer(f,'1.00'));
    assert.equal(r.outcome,'COMPLETED');
    if(r.outcome!=='COMPLETED')throw Error('Expected completed');
    await tx.query('UPDATE ledger_entries SET signed_amount_cents=signed_amount_cents WHERE transfer_id=$1',
      [r.transfer.id]);
  }),pgGuard);
  await assert.rejects(db.transaction('READ COMMITTED',async tx=>{
    const r=await service.submitInTransaction(tx,ownTransfer(f,'1.00'));
    assert.equal(r.outcome,'COMPLETED');
    if(r.outcome!=='COMPLETED')throw Error('Expected completed');
    await tx.query('DELETE FROM audit_events WHERE transfer_id=$1',[r.transfer.id]);
  }),pgGuard);
  assert.deepEqual(await walletBalances(db,f),[1_000n,0n]);
});

test('T-19 SAFE: frontera UTC del día civil America/Mexico_City',async()=>{
  const rows=await db.query(`SELECT
    ('2026-01-16 05:59:59.999+00'::timestamptz AT TIME ZONE 'America/Mexico_City')::date::text AS before_midnight,
    ('2026-01-16 06:00:00.000+00'::timestamptz AT TIME ZONE 'America/Mexico_City')::date::text AS after_midnight
  `) as Array<{before_midnight:string;after_midnight:string}>;
  assert.equal(rows[0]?.before_midnight,'2026-01-15');
  assert.equal(rows[0]?.after_midnight,'2026-01-16');
  // This validates the business-date conversion, not an actual simulated
  // clock change inside completeTransfer(). See T-19 guide for this limit.
});
