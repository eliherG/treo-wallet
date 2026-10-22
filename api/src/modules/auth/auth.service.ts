import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { DataSource } from 'typeorm';
import { HttpProblem } from '../../http/http-problem.js';
import { AccountEntity } from '../accounts/entities/account.entity.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { generateDemoClabe } from './demo-clabe.js';
import { AccessTokens, ACCESS_TTL_SECONDS, createOpaqueRefresh, refreshHash, REFRESH_TTL_DAYS } from './jwt.js';
import type { LoginInput, RegisterInput } from './schemas.js';

export interface PublicUser { id: string; name: string; email: string }

function publicUser(user: UserEntity): PublicUser {
  return { id: user.id, name: user.name, email: user.emailCanonical };
}

function pgConstraint(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'driverError' in error) {
    const driver = error.driverError;
    if (driver && typeof driver === 'object' && 'code' in driver && driver.code === '23505'
      && 'constraint' in driver && typeof driver.constraint === 'string') {
      return driver.constraint;
    }
  }
  return undefined;
}

export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly db: DataSource,
    readonly accessTokens: AccessTokens,
  ) {
    // For unknown emails, perform a real Argon2id verification to reduce timing enumeration.
    this.dummyHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
  }

  async register(input: RegisterInput): Promise<{ user: PublicUser }> {
    // Hash outside of the transaction: keep DB locks short.
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.db.transaction(async (tx) => {
          const users = tx.getRepository(UserEntity);
          const user = await users.save(users.create({
            name: input.name,
            emailCanonical: input.email,
            passwordHash,
          }));
          const accounts = tx.getRepository(AccountEntity);
          await accounts.save(accounts.create({
            userId: user.id,
            clabe: generateDemoClabe(),
            currency: 'MXN',
            status: 'ACTIVE',
            balanceCents: '0',
          }));
          return { user: publicUser(user) };
        });
      } catch (error) {
        const constraint = pgConstraint(error);
        if (constraint === 'uq_users_email_canonical') {
          throw new HttpProblem(409, 'EMAIL_ALREADY_REGISTERED', 'Correo ya registrado',
            'El correo electrónico ya está registrado.');
        }
        // A rare random CLABE collision rolls back both inserts, then retries.
        if (constraint === 'uq_accounts_clabe' && attempt < 4) continue;
        throw error;
      }
    }
    throw new Error('Could not allocate a unique demo account');
  }

  async login(input: LoginInput): Promise<{
    accessToken: string;
    accessExpiresInSeconds: number;
    refreshToken: string;
    user: PublicUser;
  }> {
    const user = await this.db.getRepository(UserEntity).findOneBy({ emailCanonical: input.email });
    const hash = user?.passwordHash ?? await this.dummyHash;
    let matches = false;
    try { matches = await argon2.verify(hash, input.password); } catch { /* do not leak hash errors */ }
    if (!user || !matches) {
      throw new HttpProblem(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas',
        'Correo o contraseña incorrectos.');
    }

    const token = createOpaqueRefresh();
    await this.db.getRepository(RefreshTokenEntity).insert({
      userId: user.id,
      familyId: randomUUID(),
      tokenHash: refreshHash(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      revokedAt: null,
      replacedById: null,
    });
    return {
      accessToken: await this.accessTokens.issue(user.id),
      accessExpiresInSeconds: ACCESS_TTL_SECONDS,
      refreshToken: token,
      user: publicUser(user),
    };
  }
}
