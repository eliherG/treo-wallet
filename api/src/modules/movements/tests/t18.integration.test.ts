import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createDataSource } from '../../../database/data-source.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccessTokens } from '../../auth/jwt.js';
import { AccountEntity } from '../../accounts/entities/account.entity.js';
import { generateDemoClabe } from '../../auth/demo-clabe.js';
import { AtomicTransferService } from '../../transfers/atomic-transfer.service.js';
import { MovementsService } from '../movements.service.js';

const db=createDataSource('app','test');
const migrator=createDataSource('migrator','test');
const auth=new AuthService(db,new AccessTokens('t18-tests-access-secret-material-of-adequate-length'));
const financial=new AtomicTransferService(db);
const history=new MovementsService(db,'t18-tests-secret-key-for-pagination-at-least-32-characters');
const users=new Set<string>();
const ROLLBACK=Symbol('T18 rollback');
before(async()=>{
  await db.initialize();await migrator.initialize();
  if(db.options.database!=='treo_test'||migrator.options.database!=='treo_test') throw Error('T18 tests require treo_test');
});
after(async()=>{
  try {if(users.size){const ids=[...users];
    await migrator.query('DELETE FROM refresh_tokens WHERE user_id=ANY($1::uuid[])',[ids]);
    await migrator.query('DELETE FROM accounts WHERE user_id=ANY($1::uuid[])',[ids]);
    await migrator.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
  }}finally{if(db.isInitialized)await db.destroy();if(migrator.isInitialized)await migrator.destroy();}
});
async function fixture(){
 const u=await auth.register({name:'Historial Treo',email:`t18-${randomUUID()}@treo.test`,password:'T18-test-only-password-123!' });
 users.add(u.user.id);
 const repo=db.getRepository(AccountEntity);
 const source=await repo.findOneByOrFail({userId:u.user.id});
 const dest=await repo.save(repo.create({userId:u.user.id,clabe:generateDemoClabe(),currency:'MXN',balanceCents:'0',status:'ACTIVE'}));
 await migrator.query('UPDATE accounts SET balance_cents=100000 WHERE id=$1',[source.id]);
 return {userId:u.user.id,sourceId:source.id,destId:dest.id};
}
async function rollback(run:(tx:Parameters<typeof history.listInTransaction>[0])=>Promise<void>) {
 await assert.rejects(db.transaction('READ COMMITTED',async tx=>{await run(tx);throw ROLLBACK;}),e=>e===ROLLBACK);
}
async function seedTransfers(tx:Parameters<typeof history.listInTransaction>[0],f:Awaited<ReturnType<typeof fixture>>,count:number) {
 for(let i=0;i<count;i++){
   const created=await financial.submitInTransaction(tx,{authenticatedUserId:f.userId,
    idempotencyKey:randomUUID(),payload:{sourceAccountId:f.sourceId,destinationAccountId:f.destId,
      amount:'1.00',concept:'Historial prueba',reference:`${100+i}`}});
   assert.equal(created.outcome,'COMPLETED');
 }
}

test('T-18: historial propio con paginación cursor sin duplicados',async()=>{
 const f=await fixture();
 await rollback(async tx=>{
  await seedTransfers(tx,f,3);
  const first=await history.listInTransaction(tx,f.userId,{limit:'2'});
  assert.equal(first.items.length,2);assert.ok(first.nextCursor);
  const second=await history.listInTransaction(tx,f.userId,{limit:'2',cursor:first.nextCursor!});
  assert.equal(second.items.length,2);assert.ok(second.nextCursor);
  const third=await history.listInTransaction(tx,f.userId,{limit:'2',cursor:second.nextCursor!});
  assert.equal(third.items.length,2);assert.equal(third.nextCursor,null);
  const all=[...first.items,...second.items,...third.items];
  assert.equal(new Set(all.map(x=>x.id)).size,6);
  assert.equal(all.every(x=>x.signedAmountCents==='100'||x.signedAmountCents==='-100'),true);
 });
});

test('T-18: filtro de tipo, cuenta y fechas inclusivas de CDMX',async()=>{
 const f=await fixture();
 await rollback(async tx=>{
  await seedTransfers(tx,f,2);
  const dates=await tx.query("SELECT (clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date::text AS day") as Array<{day:string}>;
  const day=dates[0]!.day;
  const out=await history.listInTransaction(tx,f.userId,{accountId:f.sourceId,type:'DEBIT',from:day,to:day});
  assert.equal(out.items.length,2);assert.equal(out.nextCursor,null);
  assert.equal(out.items.every(x=>x.accountId===f.sourceId&&x.type==='DEBIT'&&x.signedAmountCents==='-100'),true);
  const empty=await history.listInTransaction(tx,f.userId,{from:'2020-01-01',to:'2020-01-02'});
  assert.deepEqual(empty.items,[]);
 });
});

test('T-18: nueva operación no aparece al seguir cursor anterior',async()=>{
 const f=await fixture();
 await rollback(async tx=>{
  await seedTransfers(tx,f,2);
  const p1=await history.listInTransaction(tx,f.userId,{limit:'1'});
  assert.ok(p1.nextCursor);
  await seedTransfers(tx,f,1);
  const p2=await history.listInTransaction(tx,f.userId,{limit:'1',cursor:p1.nextCursor!});
  assert.equal(p2.items.length,1);
  assert.notEqual(p1.items[0]?.id,p2.items[0]?.id);
 });
});

test('T-18: cuenta ajena y cursor de otro usuario rechazados',async()=>{
 const f=await fixture(),other=await fixture();
 await rollback(async tx=>{
  await seedTransfers(tx,f,2);
  await assert.rejects(history.listInTransaction(tx,other.userId,{accountId:f.sourceId}),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&'status'in error&&(error as {status:number}).status===404));
  const first=await history.listInTransaction(tx,f.userId,{limit:'1'});
  await assert.rejects(history.listInTransaction(tx,other.userId,{limit:'1',cursor:first.nextCursor!}),
    (error:unknown)=>Boolean(error&&typeof error==='object'&&'status'in error&&(error as {status:number}).status===400));
 });
});

test('T-18: invalid date ranges, unsupported filters and unsigned cursor are rejected',async()=>{
 const f=await fixture();
 await rollback(async tx=>{
  for(const query of [{from:'2026-12-31',to:'2026-01-01'}, {from:'2026-02-30'},
    {limit:'101'}, {type:'OTHER'}, {cursor:'malformed'}, {accountId:'not-uuid'}, {extra:'unexpected'}]) {
    await assert.rejects(history.listInTransaction(tx,f.userId,query),
      (error:unknown)=>Boolean(error&&typeof error==='object'&&'status'in error));
  }
 });
});
