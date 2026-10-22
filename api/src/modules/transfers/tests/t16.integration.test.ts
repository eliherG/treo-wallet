import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { AtomicTransferService } from '../atomic-transfer.service.js';
import { createOtpHash, verifyOtp } from '../otp.js';

const db = createDataSource('app','test');
const migrator = createDataSource('migrator','test');
const tokens = new AccessTokens('t16-test-access-only-token-secret-abcdefghijklmn');
const auth = new AuthService(db,tokens);
const policy = {code:'719253',secret:'t16-demo-tests-secret-with-more-than-32-characters',mode:'test' as const};
const service = new AtomicTransferService(db,policy);
const users = new Set<string>();
const ROLLBACK = Symbol('T16 rollback');

before(async()=>{
  await db.initialize(); await migrator.initialize();
  if (db.options.database !== migrator.options.database || db.options.database !== 'treo_test')
    throw new Error('T16 tests run only against treo_test');
});
after(async()=>{
  try {
    if (users.size) {
      const ids=[...users];
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id = ANY($1::uuid[])',[ids]);
      await migrator.query('DELETE FROM accounts WHERE user_id = ANY($1::uuid[])',[ids]);
      await migrator.query('DELETE FROM users WHERE id = ANY($1::uuid[])',[ids]);
    }
  } finally { if(db.isInitialized) await db.destroy(); if(migrator.isInitialized) await migrator.destroy(); }
});
async function fixture() {
  const user=await auth.register({name:'Usuario OTP',email:`t16-${randomUUID()}@treo.test`,password:'T16-TestOnlyPassword-123!'});
  users.add(user.user.id);
  const accounts=db.getRepository(AccountEntity);
  const source=await accounts.findOneByOrFail({userId:user.user.id});
  const dest=await accounts.save(accounts.create({userId:user.user.id,clabe:generateDemoClabe(),currency:'MXN',balanceCents:'0',status:'ACTIVE'}));
  await migrator.query('UPDATE accounts SET balance_cents=$2::bigint WHERE id=$1',[source.id,'3000000']);
  return {userId:user.user.id,src:source.id,dst:dest.id};
}
async function rollback(run:(tx:Parameters<typeof service.submitInTransaction>[0])=>Promise<void>) {
  await assert.rejects(db.transaction('READ COMMITTED',async tx=>{await run(tx);throw ROLLBACK;}),e=>e===ROLLBACK);
}
function payload(f:Awaited<ReturnType<typeof fixture>>,amount='5000.01') {
  return {sourceAccountId:f.src,destinationAccountId:f.dst,amount,concept:'Confirmacion OTP',reference:'0012300'};
}
function submission(f:Awaited<ReturnType<typeof fixture>>,amount='5000.01') {
  return {authenticatedUserId:f.userId,idempotencyKey:randomUUID(),payload:payload(f,amount),requestId:randomUUID()};
}

test('T-16: demo OTP uses bound keyed hash and refuses production mode',()=>{
  const id=randomUUID(); const hashed=createOtpHash(id,policy);
  assert.equal(verifyOtp(id,policy.code,hashed,policy),true);
  assert.equal(verifyOtp(randomUUID(),policy.code,hashed,policy),false);
  assert.equal(verifyOtp(id,'111111',hashed,policy),false);
  assert.throws(()=>createOtpHash(id,{...policy,mode:'production'}));
});

test('T-16: pendiente no consume dinero y replay no crea otro OTP',async()=>{
  const f=await fixture();
  await rollback(async tx=>{
    const input=submission(f);
    const first=await service.submitInTransaction(tx,input);
    const replay=await service.submitInTransaction(tx,input);
    assert.equal(first.outcome,'PENDING_CONFIRMATION');
    assert.equal(replay.outcome,'PENDING_CONFIRMATION');
    assert.equal(first.transfer.id,replay.transfer.id);
    assert.equal(replay.replayed,true);
    const rows=await tx.query('SELECT id FROM otp_challenges WHERE transfer_id=$1',[first.transfer.id]) as unknown[];
    assert.equal(rows.length,1);
    const entries=await tx.query('SELECT id FROM ledger_entries WHERE transfer_id=$1',[first.transfer.id]) as unknown[];
    const usage=await tx.query('SELECT user_id FROM daily_transfer_usage WHERE user_id=$1',[f.userId]) as unknown[];
    assert.equal(entries.length,0);assert.equal(usage.length,0);
  });
});

test('T-16: OTP correcto contabiliza exactamente una vez y marca usado',async()=>{
  const f=await fixture();
  await rollback(async tx=>{
    const created=await service.submitInTransaction(tx,submission(f));
    assert.equal(created.outcome,'PENDING_CONFIRMATION');
    const confirm={authenticatedUserId:f.userId,transferId:created.transfer.id,otp:policy.code};
    const first=await service.confirmInTransaction(tx,confirm);
    assert.equal(first.outcome,'COMPLETED');
    const second=await service.confirmInTransaction(tx,confirm);
    assert.equal(second.outcome,'COMPLETED');
    assert.equal(second.replayed,true);
    const balances=await tx.query('SELECT id,balance_cents FROM accounts WHERE id=ANY($1::uuid[])',[[f.src,f.dst]]) as Array<{id:string;balance_cents:string}>;
    const map=new Map(balances.map(x=>[x.id,x.balance_cents]));
    assert.equal(map.get(f.src),'2499999');assert.equal(map.get(f.dst),'500001');
    const entries=await tx.query('SELECT signed_amount_cents FROM ledger_entries WHERE transfer_id=$1',[created.transfer.id]) as Array<{signed_amount_cents:string}>;
    assert.equal(entries.length,2);
    assert.equal(entries.reduce((s,x)=>s+BigInt(x.signed_amount_cents),0n),0n);
    const used=await tx.query('SELECT used_at FROM otp_challenges WHERE transfer_id=$1',[created.transfer.id]) as Array<{used_at:Date|null}>;
    assert.ok(used[0]?.used_at);
    const quota=await tx.query('SELECT spent_cents,business_date::text FROM daily_transfer_usage WHERE user_id=$1',[f.userId]) as Array<{spent_cents:string;business_date:string}>;
    assert.equal(quota[0]?.spent_cents,'500001');
    const date=await tx.query("SELECT (clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date::text AS day") as Array<{day:string}>;
    assert.equal(quota[0]?.business_date,date[0]?.day);
  });
});

test('T-16: tres códigos erróneos rechazan definitivamente sin dinero',async()=>{
  const f=await fixture();
  await rollback(async tx=>{
    const created=await service.submitInTransaction(tx,submission(f));
    if(created.outcome==='ERROR')throw Error('Unable to create pending');
    for(let i=0;i<3;i++) {
      const result=await service.confirmInTransaction(tx,{authenticatedUserId:f.userId,transferId:created.transfer.id,otp:'000000'});
      assert.equal(result.outcome,'ERROR');
      if(result.outcome==='ERROR')assert.equal(result.problem.code,i===2?'OTP_ATTEMPTS_EXCEEDED':'OTP_INVALID');
    }
    const rows=await tx.query('SELECT status FROM transfers WHERE id=$1',[created.transfer.id]) as Array<{status:string}>;
    assert.equal(rows[0]?.status,'REJECTED');
    const entries=await tx.query('SELECT id FROM ledger_entries WHERE transfer_id=$1',[created.transfer.id]) as unknown[];
    assert.equal(entries.length,0);
  });
});

test('T-16: OTP expirado rechaza sin debit o credito',async()=>{
  const f=await fixture();
  await rollback(async tx=>{
    const created=await service.submitInTransaction(tx,submission(f));
    if(created.outcome==='ERROR')throw Error('Unable to create pending');
    await tx.query("UPDATE otp_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE transfer_id=$1",[created.transfer.id]);
    const result=await service.confirmInTransaction(tx,{authenticatedUserId:f.userId,transferId:created.transfer.id,otp:policy.code});
    assert.equal(result.outcome,'ERROR');
    if(result.outcome==='ERROR')assert.equal(result.problem.code,'OTP_EXPIRED');
    const rows=await tx.query('SELECT status FROM transfers WHERE id=$1',[created.transfer.id]) as Array<{status:string}>;
    assert.equal(rows[0]?.status,'REJECTED');
  });
});

test('T-16: confirmación no permite transferencias ajenas',async()=>{
  const sender=await fixture(),other=await fixture();
  await rollback(async tx=>{
    const created=await service.submitInTransaction(tx,submission(sender));
    if(created.outcome==='ERROR')throw Error('Unable to create pending');
    const result=await service.confirmInTransaction(tx,{authenticatedUserId:other.userId,transferId:created.transfer.id,otp:policy.code});
    assert.equal(result.outcome,'ERROR');
    if(result.outcome==='ERROR')assert.equal(result.problem.status,404);
  });
});
