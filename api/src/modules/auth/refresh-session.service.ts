import type { DataSource, EntityManager } from 'typeorm';
import { HttpProblem } from '../../http/http-problem.js';
import { ACCESS_TTL_SECONDS, AccessTokens, createOpaqueRefresh, refreshHash, REFRESH_TTL_DAYS } from './jwt.js';
import type { PublicUser } from './auth.service.js';

interface SessionIdentity { id: string; user_id: string }
interface LockedSession {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
}
interface DatabaseUser { id: string; name: string; email_canonical: string }
interface Rotation {
  refreshToken: string;
  user: PublicUser;
}
type RotationOutcome = { kind: 'invalid' } | { kind: 'reused'; actorUserId: string }
  | { kind: 'issued'; value: Rotation };

export interface SessionSecurityEvent {
  event: 'auth.refresh_rotated' | 'auth.refresh_reuse_detected' | 'auth.logout';
  actorUserId: string;
  requestId: string | null;
}

const opaqueTokenFormat = /^[A-Za-z0-9_-]{43}$/;

/** Refresh tokens are opaque random bytes. Only their SHA-256 hashes reach PostgreSQL. */
export class RefreshSessionService {
  constructor(
    private readonly db: DataSource,
    private readonly accessTokens: AccessTokens,
    private readonly onSecurityEvent: (event: SessionSecurityEvent) => void = () => {},
  ) {}

  /**
   * Serialize all changes to a user's token families with a user-row lock.
   * The initial lookup is not authoritative: it MUST be re-read after the lock.
   */
  private async lockedSession(tx: EntityManager, hash: string): Promise<LockedSession | null> {
    const identities = await tx.query(
      'SELECT id, user_id FROM "refresh_tokens" WHERE "token_hash" = $1', [hash],
    ) as SessionIdentity[];
    const identity = identities[0];
    if (!identity) return null;
    await tx.query('SELECT id FROM "users" WHERE id = $1 FOR UPDATE', [identity.user_id]);
    const sessions = await tx.query(`
      SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by_id
      FROM "refresh_tokens" WHERE id = $1 FOR UPDATE
    `, [identity.id]) as LockedSession[];
    return sessions[0] ?? null;
  }

  private async revokeFamily(tx: EntityManager, familyId: string): Promise<void> {
    await tx.query(`
      UPDATE "refresh_tokens"
      SET "revoked_at" = now()
      WHERE "family_id" = $1 AND "revoked_at" IS NULL
    `, [familyId]);
  }

  async refresh(token: string, requestId: string | null = null): Promise<{
    accessToken: string;
    accessExpiresInSeconds: number;
    refreshToken: string;
    user: PublicUser;
  }> {
    if (!opaqueTokenFormat.test(token)) throw invalidRefresh();
    const outcome = await this.db.transaction<RotationOutcome>(async (tx) => {
      const session = await this.lockedSession(tx, refreshHash(token));
      if (!session) return { kind: 'invalid' };

      if (session.replaced_by_id !== null) {
        // A reused refresh token revokes the entire family, not merely this old row.
        // Return a result instead of throwing inside the transaction: revocation MUST commit.
        await this.revokeFamily(tx, session.family_id);
        return { kind: 'reused', actorUserId: session.user_id };
      }
      if (session.revoked_at !== null || new Date(session.expires_at).getTime() <= Date.now()) {
        return { kind: 'invalid' };
      }

      const users = await tx.query(
        'SELECT id, name, email_canonical FROM "users" WHERE id = $1', [session.user_id],
      ) as DatabaseUser[];
      const user = users[0];
      if (!user) return { kind: 'invalid' };

      const replacement = createOpaqueRefresh();
      const inserted = await tx.query(`
        INSERT INTO "refresh_tokens" (user_id, family_id, token_hash, expires_at,
          revoked_at, replaced_by_id)
        VALUES ($1, $2, $3, $4, NULL, NULL) RETURNING id
      `, [session.user_id, session.family_id, refreshHash(replacement),
        new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000)]) as Array<{ id: string }>;
      const newId = inserted[0]?.id;
      if (!newId) throw new Error('Refresh replacement insert failed');
      const rawResult: unknown = await tx.query(`
  UPDATE "refresh_tokens"
  SET "revoked_at" = now(), "replaced_by_id" = $1
  WHERE id = $2 AND "revoked_at" IS NULL AND "replaced_by_id" IS NULL
  RETURNING id
`, [newId, session.id]);

const updatedRows: unknown =
  Array.isArray(rawResult) && Array.isArray(rawResult[0])
    ? rawResult[0]
    : rawResult;

  if (
    !Array.isArray(updatedRows) ||
    updatedRows.length !== 1 ||
    updatedRows[0]?.id !== session.id
  ) {
    throw new Error('Refresh rotation conflict');
  }
      return {
        kind: 'issued',
        value: {
          refreshToken: replacement,
          user: { id: user.id, name: user.name, email: user.email_canonical },
        },
      };
    });

    if (outcome.kind === 'reused') {
      this.onSecurityEvent({ event: 'auth.refresh_reuse_detected',
        actorUserId: outcome.actorUserId, requestId });
      throw invalidRefresh();
    }
    if (outcome.kind === 'invalid') throw invalidRefresh();
    this.onSecurityEvent({ event: 'auth.refresh_rotated',
      actorUserId: outcome.value.user.id, requestId });
    return {
      accessToken: await this.accessTokens.issue(outcome.value.user.id),
      accessExpiresInSeconds: ACCESS_TTL_SECONDS,
      refreshToken: outcome.value.refreshToken,
      user: outcome.value.user,
    };
  }

  /** Idempotent logout. Revokes only this session family, not the user's other devices. */
  async logout(token: string | null, requestId: string | null = null): Promise<void> {
    if (!token || !opaqueTokenFormat.test(token)) return;
    const actorUserId = await this.db.transaction<string | null>(async (tx) => {
      const session = await this.lockedSession(tx, refreshHash(token));
      if (!session) return null;
      await this.revokeFamily(tx, session.family_id);
      return session.user_id;
    });
    if (actorUserId) this.onSecurityEvent({ event: 'auth.logout', actorUserId, requestId });
  }
}

function invalidRefresh(): HttpProblem {
  return new HttpProblem(401, 'INVALID_SESSION', 'Sesión inválida',
    'La sesión no es válida o ha expirado. Inicia sesión nuevamente.');
}
