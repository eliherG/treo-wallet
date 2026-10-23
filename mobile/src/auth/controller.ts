import type { AuthTransport, MobileAuthReply, MobileCredentials, MobileUser, TokenStorage } from './types';

export class MobileAuthError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'MobileAuthError';
  }
}

/** Portable logic: no React Native imports. Access JWT is NEVER persisted. */
export class MobileAuthController {
  private accessToken: string | null = null;
  private currentUser: MobileUser | null = null;
  private refreshInFlight: Promise<MobileUser | null> | null = null;
  constructor(private readonly storage: TokenStorage, private readonly api: AuthTransport) {}

  get user(): MobileUser | null { return this.currentUser; }
  get access(): string | null { return this.accessToken; }

  private async accept(reply: MobileAuthReply): Promise<MobileUser> {
    if (!reply.refreshToken || !reply.accessToken || !reply.user?.id) {
      throw new MobileAuthError(0, 'INVALID_RESPONSE', 'Respuesta de autenticación incompleta.');
    }
    // Persistence must succeed before displaying an authenticated session.
    await this.storage.write(reply.refreshToken);
    this.accessToken = reply.accessToken;
    this.currentUser = reply.user;
    return reply.user;
  }

  async login(input: MobileCredentials): Promise<MobileUser> {
    const reply = await this.api.login(input);
    return this.accept(reply);
  }

  /** Rehydrate by rotating refresh; a revoked refresh removes local credentials. */
  async restore(): Promise<MobileUser | null> {
    const refresh = await this.storage.read();
    if (!refresh) { this.accessToken = null; this.currentUser = null; return null; }
    try { return await this.accept(await this.api.refresh(refresh)); }
    catch (error) {
      if (error instanceof MobileAuthError && error.status === 401) {
        await this.storage.remove();
        this.accessToken = null;
        this.currentUser = null;
        return null;
      }
      // NETWORK_ERROR: preserve rotated/current refresh for later retry.
      throw error;
    }
  }

  async renew(): Promise<MobileUser | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const pending = this.restore().finally(() => { this.refreshInFlight = null; });
    this.refreshInFlight = pending;
    return pending;
  }

  async logout(): Promise<void> {
    const refresh = await this.storage.read();
    // Do not report successful logout before the backend acknowledges revocation.
    if (refresh) await this.api.logout(refresh);
    await this.storage.remove();
    this.accessToken = null;
    this.currentUser = null;
  }
}
