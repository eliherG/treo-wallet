import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createDataSource } from '../../../database/data-source.js';
import { BeneficiaryEntity } from '../../beneficiaries/entities/beneficiary.entity.js';
import { AtomicTransferService, type SubmitTransferResult } from '../atomic-transfer.service.js';
import {
  accountLedgerNet, assertTestDatabase, createTestWallet, ownTransfer,
  reconcileSender, runBounded, runTogether, walletBalances,
} from './t19-fixtures.js';

/**
 * T-19 real PostgreSQL contention: each request uses its OWN committed
 * READ COMMITTED transaction. THIS SUITE INTENTIONALLY PERSISTS test fixtures.
 * Ledger/audit cannot be cleaned by DELETE (T-06). Never run automatically.
 */
const db = createDataSource('app','test');
const migrator = createDataSource('migrator','test');
const policy = {code:'719253',secret:'t19-only-test-otp-hmac-secret-32-characters-minimum',mode:'test' as const};
const service = new AtomicTransferService(db,policy);
const suiteRun = randomUUID();

before(async()=>{
  if (process.env.TREO_T19_PERSISTENT_STRESS !== 'ACKNOWLEDGE_IMMUTABLE_LEDGER') {
    throw new Error('T19 stress deliberately commits immutable financial fixtures. Set TREO_T19_PERSISTENT_STRESS=ACKNOWLEDGE_IMMUTABLE_LEDGER for this command only.');
  }
  assertTestDatabase(db,migrator);
  await db.initialize();await migrator.initialize();
  const verifiedTrigger=await db.query(`SELECT COUNT(*)::int AS n FROM pg_trigger
    WHERE tgname='treo_verify_transfers_ledger' AND NOT tgisinternal`) as Array<{n:number}>;
  if (verifiedTrigger[0]?.n!==1) throw new Error('T19 requires ledger integrity trigger T-06');
  console.info(JSON.stringify({event:'t19.stress.started',db:'treo_test',
    warning:'Synthetic records and immutable ledger will REMAIN in treo_test'}));
});
after(async()=>{
  if(db.isInitialized)await db.destroy();
  if(migrator.isInitialized)await migrator.destroy();
  // Deliberately do not DELETE ledger, audit, transfers, accounts or users.
});

function assertCompleted(results:SubmitTransferResult[],count:number):string[] {
  assert.equal(results.length,count);
  const ids:string[]=[];
  for(const result of results){
    assert.equal(result.outcome,'COMPLETED',result.outcome==='ERROR'?result.problem.code:undefined);
    if(result.outcome!=='COMPLETED')throw Error('Unexpected result');
    ids.push(result.transfer.id);
  }
  return ids;
}

test('T-19 STRESS: 120 llaves independientes compiten por el mismo saldo, sin sobregiro',async()=>{
  const wallet=await createTestWallet(db,migrator,'overdraft',6_000n);
  const jobs=Array.from({length:120},(_,i)=>()=>service.submit(
    ownTransfer(wallet,'1.00',`t19-overdraft-${suiteRun}-${i}`)));
  const outcomes=await runTogether(jobs);
  const completed=outcomes.filter(o=>o.outcome==='COMPLETED');
  const rejected=outcomes.filter(o=>o.outcome==='ERROR');
  assert.equal(completed.length,60);
  assert.equal(rejected.length,60);
  assert.ok(rejected.every(o=>o.outcome==='ERROR'&&o.problem.code==='INSUFFICIENT_FUNDS'));
  const ids=completed.map(o=>o.outcome==='COMPLETED'?o.transfer.id:'');
  assert.equal(new Set(ids).size,60,'distinct requests cannot reuse transfer IDs');
  assert.deepEqual(await walletBalances(db,wallet),[0n,6_000n]);
  const summary=await reconcileSender(db,wallet.userId);
  assert.deepEqual(summary,{completed:60,rejected:60,other:0,entries:120,audits:60,net:0n,outflow:6_000n});
  const net=await accountLedgerNet(db,[wallet.sourceId,wallet.destinationId]);
  assert.equal(net.get(wallet.sourceId),-6_000n);
  assert.equal(net.get(wallet.destinationId),6_000n);
  const usage=await db.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',[wallet.userId]) as Array<{spent_cents:string}>;
  assert.equal(usage[0]?.spent_cents,'6000');
  console.info(JSON.stringify({event:'t19.overdraft.verified',attempts:120,completed:60,rejected:60}));
});

test('T-19 STRESS: 120 solicitudes paralelas con misma llave hacen un solo débito',async()=>{
  const wallet=await createTestWallet(db,migrator,'idempotency',10_000n);
  const base=ownTransfer(wallet,'10.00',`t19-replay-${suiteRun}`);
  const attempts=Array.from({length:120},()=>()=>service.submit({...base,requestId:randomUUID()}));
  const outcomes=await runTogether(attempts);
  const ids=assertCompleted(outcomes,120);
  assert.equal(new Set(ids).size,1);
  assert.equal(outcomes.filter(o=>o.outcome==='COMPLETED'&&!o.replayed).length,1);
  assert.equal(outcomes.filter(o=>o.outcome==='COMPLETED'&&o.replayed).length,119);
  assert.deepEqual(await walletBalances(db,wallet),[9_000n,1_000n]);
  const summary=await reconcileSender(db,wallet.userId);
  assert.deepEqual(summary,{completed:1,rejected:0,other:0,entries:2,audits:1,net:0n,outflow:1_000n});
  console.info(JSON.stringify({event:'t19.replay.verified',attempts:120,uniqueTransfers:1}));
});

test('T-19 STRESS: 120 intentos paralelos respetan límite de 20,000 MXN',async()=>{
  const wallet=await createTestWallet(db,migrator,'daily-limit',3_000_000n);
  const attempts=Array.from({length:120},(_,i)=>()=>service.submit(
    ownTransfer(wallet,'200.00',`t19-daily-${suiteRun}-${i}`)));
  const outcomes=await runTogether(attempts);
  assert.equal(outcomes.filter(o=>o.outcome==='COMPLETED').length,100);
  const rejected=outcomes.filter(o=>o.outcome==='ERROR');
  assert.equal(rejected.length,20);
  assert.ok(rejected.every(o=>o.outcome==='ERROR'&&o.problem.code==='DAILY_LIMIT_EXCEEDED'));
  assert.deepEqual(await walletBalances(db,wallet),[1_000_000n,2_000_000n]);
  const summary=await reconcileSender(db,wallet.userId);
  assert.deepEqual(summary,{completed:100,rejected:20,other:0,entries:200,audits:100,net:0n,outflow:2_000_000n});
  const quota=await db.query('SELECT spent_cents FROM daily_transfer_usage WHERE user_id=$1',[wallet.userId]) as Array<{spent_cents:string}>;
  assert.equal(quota[0]?.spent_cents,'2000000');
  console.info(JSON.stringify({event:'t19.daily.verified',attempts:120,completed:100,rejected:20}));
});

test('T-19 STRESS: beneficiarios cruzados entre usuarios y mismo valor de llave',async()=>{
  const a=await createTestWallet(db,migrator,'cross-a',10_000n);
  const b=await createTestWallet(db,migrator,'cross-b',10_000n);
  const beneficiaries=db.getRepository(BeneficiaryEntity);
  const aToB=await beneficiaries.save(beneficiaries.create({
    userId:a.userId,clabe:b.sourceClabe,name:'Synthetic B',alias:'B'}));
  const bToA=await beneficiaries.save(beneficiaries.create({
    userId:b.userId,clabe:a.sourceClabe,name:'Synthetic A',alias:'A'}));
  const jobs=Array.from({length:30},(_,i)=>{
    const key=`t19-cross-${suiteRun}-${i}`;
    return [
      ()=>service.submit({authenticatedUserId:a.userId,idempotencyKey:key,
        payload:{sourceAccountId:a.sourceId,beneficiaryId:aToB.id,
          amount:'0.01',concept:'Cross stress A',reference:'0019'}}),
      ()=>service.submit({authenticatedUserId:b.userId,idempotencyKey:key,
        payload:{sourceAccountId:b.sourceId,beneficiaryId:bToA.id,
          amount:'0.01',concept:'Cross stress B',reference:'0019'}}),
    ];
  }).flat();
  const outcomes=await runBounded(jobs,16);
  assert.equal(new Set(assertCompleted(outcomes,60)).size,60);
  const sumA=await reconcileSender(db,a.userId);
  const sumB=await reconcileSender(db,b.userId);
  assert.deepEqual(sumA,{completed:30,rejected:0,other:0,entries:60,audits:30,net:0n,outflow:30n});
  assert.deepEqual(sumB,{completed:30,rejected:0,other:0,entries:60,audits:30,net:0n,outflow:30n});
  // Each account receives 30 cents while sending 30 cents.
  assert.equal((await walletBalances(db,a))[0],10_000n);
  assert.equal((await walletBalances(db,b))[0],10_000n);
  const net=await accountLedgerNet(db,[a.sourceId,b.sourceId]);
  assert.equal(net.get(a.sourceId),0n);assert.equal(net.get(b.sourceId),0n);
  console.info(JSON.stringify({event:'t19.cross.verified',requests:60,transferCount:60}));
});

test('T-19 STRESS: 32 confirmaciones OTP paralelas acreditan una sola vez',async()=>{
  const wallet=await createTestWallet(db,migrator,'otp',1_000_000n);
  const created=await service.submit(ownTransfer(wallet,'5000.01',`t19-otp-${suiteRun}`));
  assert.equal(created.outcome,'PENDING_CONFIRMATION');
  if(created.outcome!=='PENDING_CONFIRMATION')throw Error('Could not create OTP challenge');
  const pending=await reconcileSender(db,wallet.userId);
  assert.equal(pending.entries,0);assert.equal(pending.outflow,0n);
  assert.deepEqual(await walletBalances(db,wallet),[1_000_000n,0n]);
  const attempts=Array.from({length:32},()=>()=>service.confirm({
    authenticatedUserId:wallet.userId,transferId:created.transfer.id,otp:policy.code,
    requestId:randomUUID(),
  }));
  const outcomes=await runBounded(attempts,12);
  assert.equal(new Set(assertCompleted(outcomes,32)).size,1);
  assert.equal(outcomes.filter(o=>o.outcome==='COMPLETED'&&!o.replayed).length,1);
  assert.deepEqual(await walletBalances(db,wallet),[499_999n,500_001n]);
  const summary=await reconcileSender(db,wallet.userId);
  assert.deepEqual(summary,{completed:1,rejected:0,other:0,entries:2,audits:1,net:0n,outflow:500_001n});
  const challenge=await db.query(`SELECT COUNT(*)::int AS challenges,
    COUNT(*) FILTER(WHERE used_at IS NOT NULL)::int AS used
    FROM otp_challenges WHERE transfer_id=$1`,[created.transfer.id]) as Array<{challenges:number;used:number}>;
  assert.equal(challenge[0]?.challenges,1);
  assert.equal(challenge[0]?.used,1);
  const usage=await db.query(`SELECT business_date::text AS day, spent_cents
    FROM daily_transfer_usage WHERE user_id=$1`,[wallet.userId]) as Array<{day:string;spent_cents:string}>;
  assert.equal(usage.length,1);
  assert.equal(usage[0]?.spent_cents,'500001');
  // Business day is derived from PostgreSQL after successful OTP, not from
  // the earlier PENDING_CONFIRMATION date.
  console.info(JSON.stringify({event:'t19.otp.verified',attempts:32,uniqueCompletions:1}));
});
