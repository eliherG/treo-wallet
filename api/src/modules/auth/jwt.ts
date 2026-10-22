import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 7;
export const REFRESH_COOKIE_NAME = 'treo_refresh';

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    const key = new TextEncoder().encode(secret);
    if (key.length < 32) throw new Error('JWT_ACCESS_SECRET debe tener al menos 32 bytes');
    this.key = key;
  }

  async issue(userId: string): Promise<string> {
    return new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setIssuer('treo-wallet-api')
      .setAudience('treo-wallet')
      .setSubject(userId)
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: 'treo-wallet-api',
        audience: 'treo-wallet',
        algorithms: ['HS256'],
      });
      if (payload.token_use !== 'access' || typeof payload.sub !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub)) {
        return null;
      }
      return payload.sub;
    } catch {
      return null;
    }
  }
}

export function createOpaqueRefresh(): string {
  return randomBytes(32).toString('base64url');
}

export function refreshHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
