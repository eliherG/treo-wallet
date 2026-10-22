import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeMovementCursor,decodeMovementCursor,filterFingerprint } from '../cursor.js';
const secret='t18-tests-only-cursor-secret-at-least-32-chars';
const actor='e4696f90-e0bb-4af3-bcef-8378a74d8c32';
const other='450dd42d-81ec-4dde-b40a-5fe245a0fd31';
const filters={accountId:null,type:null,from:null,to:null,limit:20} as const;
const boundary={createdAt:'2026-10-22T12:00:00.123Z',id:'b4a12ab0-443b-4459-9caa-ac43429c6e1a'};

test('T-18: cursor opaco redondo y firma determinista',()=>{
  const value=encodeMovementCursor(boundary,actor,filters,secret);
  assert.deepEqual(decodeMovementCursor(value,actor,filters,secret),boundary);
  assert.equal(value,encodeMovementCursor(boundary,actor,filters,secret));
  assert.equal(value.includes(actor),false);
});
test('T-18: cursor manipulado o firma distinta se rechaza',()=>{
  const value=encodeMovementCursor(boundary,actor,filters,secret);
  assert.throws(()=>decodeMovementCursor(`${value[0]==='A'?'B':'A'}${value.slice(1)}`,actor,filters,secret));
  assert.throws(()=>decodeMovementCursor(value,actor,filters,secret+'incorrect'));
});
test('T-18: cursor de otro usuario o filtros distintos se rechaza',()=>{
  const value=encodeMovementCursor(boundary,actor,filters,secret);
  assert.throws(()=>decodeMovementCursor(value,other,filters,secret));
  assert.throws(()=>decodeMovementCursor(value,actor,{...filters,type:'DEBIT'},secret));
  assert.throws(()=>decodeMovementCursor(value,actor,{...filters,limit:40},secret));
  assert.notEqual(filterFingerprint(actor,filters),filterFingerprint(actor,{...filters,from:'2026-10-22'}));
});
