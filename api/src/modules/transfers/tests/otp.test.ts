import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOtpHash, verifyOtp } from '../otp.js';
const policy = {code:'348921',secret:'t16-unit-tests-HMAC-secret-0123456789abcdefghijkl',mode:'test' as const};
test('T-16 OTP: HMAC vinculado a transferencia y comparación constante',()=>{
 const id=randomUUID(), hashed=createOtpHash(id,policy);
 assert.equal(hashed.length,64);
 assert.equal(verifyOtp(id,'348921',hashed,policy),true);
 assert.equal(verifyOtp(id,'111111',hashed,policy),false);
 assert.equal(verifyOtp(randomUUID(),'348921',hashed,policy),false);
});
test('T-16 OTP: configuración demo nunca se habilita en producción',()=>{
 assert.throws(()=>createOtpHash(randomUUID(),{...policy,mode:'production'}));
 assert.throws(()=>createOtpHash(randomUUID(),{...policy,secret:'short'}));
});
