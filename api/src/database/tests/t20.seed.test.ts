import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createDataSource } from '../data-source.js';
import { AuthService } from '../../modules/auth/auth.service.js';
import { AccessTokens } from '../../modules/auth/jwt.js';
import { AccountEntity } from '../../modules/accounts/entities/account.entity.js';
import { generateDemoClabe } from '../../modules/auth/demo-clabe.js';
import { fixtureUuid, fixtureClabe, seedMovements, insertSeedBatch,
  SEED_BATCH_SIZE } from '../seeds/t20-common.js';

const db = createDataSource('app','test');
const migrator = createDataSource('migrator','test');
const users: string[] = [];
const auth = new AuthService(db, new AccessTokens('t20-test-only-access-key-123456789012345'));
const ROLLBACK = Symbol('T20 no committed ledger in tests');
before(async()=>{
  await db.initialize(); await migrator.initialize();
  if(db.options.database!=='treo_test'||migrator.options.database!=='treo_test')
    throw Error('T20 tests must use treo_test');
});
after(async()=>{
  try {
    if(users.length){
      await migrator.query('DELETE FROM refresh_tokens WHERE user_id=ANY($1::uuid[])',[users]);
      await migrator.query('DELETE FROM accounts WHERE user_id=ANY($1::uuid[])',[users]);
      await migrator.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
    }
  } finally {if(db.isInitialized)await db.destroy();if(migrator.isInitialized)await migrator.destroy();}
});

test('T-20: IDs y CLABEs sintéticos reproducibles; fingerprint canónico',()=>{
  assert.equal(fixtureUuid('user:A'),fixtureUuid('user:A'));
  assert.match(fixtureUuid('user:A'),/^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  assert.notEqual(fixtureUuid('user:A'),fixtureUuid('user:B'));
  assert.match(fixtureClabe(7),/^999\d{15}$/);
  const rows=seedMovements(0,4);
  assert.equal(rows.length,4);
  assert.equal(rows[0]?.id,seedMovements(0,4)[0]?.id);
  assert.equal(rows[0]?.fingerprint,seedMovements(0,4)[0]?.fingerprint);
  assert.notEqual(rows[0]?.fingerprint,rows[1]?.fingerprint);
  assert.throws(()=>seedMovements(1,2));
  assert.throws(()=>seedMovements(0,SEED_BATCH_SIZE+2));
});

test('T-20: cuatro transferencias producen ocho asientos balanceados; rerun no duplica',async()=>{
  const registered=await auth.register({name:'Seed T20 Integration',
    email:`t20-${randomUUID()}@treo.test`,password:'T20TestPassword-12345!' });
  users.push(registered.user.id);
  const repo=db.getRepository(AccountEntity);
  const a=await repo.findOneByOrFail({userId:registered.user.id});
  const b=await repo.save(repo.create({userId:registered.user.id,
    clabe:generateDemoClabe(),currency:'MXN',balanceCents:'0',status:'ACTIVE'}));
  await assert.rejects(db.transaction('READ COMMITTED',async tx=>{
    const first=await insertSeedBatch(tx,{userId:registered.user.id,accountA:a.id,
      accountB:b.id,start:0,count:4});
    assert.equal(first,'CREATED');
    const second=await insertSeedBatch(tx,{userId:registered.user.id,accountA:a.id,
      accountB:b.id,start:0,count:4});
    assert.equal(second,'EXISTS');
    const ledger=await tx.query(`SELECT count(*)::integer AS n,
      coalesce(sum(signed_amount_cents),0)::text AS net FROM ledger_entries
      WHERE account_id=ANY($1::uuid[])`, [[a.id,b.id]]) as Array<{n:number;net:string}>;
    assert.equal(ledger[0]?.n,8);assert.equal(ledger[0]?.net,'0');
    const usage=await tx.query(`SELECT spent_cents FROM daily_transfer_usage
      WHERE user_id=$1::uuid`,[registered.user.id]) as Array<{spent_cents:string}>;
    assert.equal(usage[0]?.spent_cents,'4');
    const audit=await tx.query(`SELECT count(*)::integer AS n FROM audit_events
      WHERE actor_user_id=$1::uuid`,[registered.user.id]) as Array<{n:number}>;
    assert.equal(audit[0]?.n,4);
    throw ROLLBACK;
  }),e=>e===ROLLBACK);
  const accounts=await db.query('SELECT balance_cents FROM accounts WHERE id = ANY($1::uuid[])',
    [[a.id,b.id]]) as Array<{balance_cents:string}>;
  assert.deepEqual(accounts.map(x=>x.balance_cents).sort(),['0','0']);
});
