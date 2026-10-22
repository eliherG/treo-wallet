import { createHmac, timingSafeEqual } from 'node:crypto';

export type OtpPolicy = { code?: string; secret?: string; mode?: 'test' | 'development' | 'production' };

function configuration(policy?: OtpPolicy): { code: string; secret: string } {
  const mode = policy?.mode ?? process.env.NODE_ENV;
  if (mode === 'production') throw new Error('Fixed demonstration OTP forbidden in production');
  const code = policy?.code ?? process.env.TREO_DEMO_OTP;
  const secret = policy?.secret ?? process.env.TREO_OTP_HMAC_SECRET;
  if (!code || !/^[0-9]{6}$/.test(code) || !secret || secret.length < 32) {
    throw new Error('Demo OTP requires TREO_DEMO_OTP (6 digits) and TREO_OTP_HMAC_SECRET (32+ characters)');
  }
  return { code, secret };
}

function digest(transferId: string, code: string, secret: string): Buffer {
  return createHmac('sha256', secret).update('treo:otp:v1:').update(transferId).update(':')
    .update(code).digest();
}

export function createOtpHash(transferId: string, policy?: OtpPolicy): string {
  const { code, secret } = configuration(policy);
  return digest(transferId, code, secret).toString('hex');
}

export function verifyOtp(transferId: string, candidate: string, stored: string, policy?: OtpPolicy): boolean {
  const { secret } = configuration(policy);
  if (!/^[0-9]{6}$/.test(candidate) || !/^[0-9a-f]{64}$/.test(stored)) return false;
  return timingSafeEqual(digest(transferId, candidate, secret), Buffer.from(stored,'hex'));
}
