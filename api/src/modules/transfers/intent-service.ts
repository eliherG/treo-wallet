import type { DataSource, EntityManager } from 'typeorm';
import { normalizeUuid, normalizeTransferIntent, hashTransferPayload,
  validateIdempotencyKey, type ResolvedTransferIntent } from './idempotency.js';
import { registerIntentInTransaction, type IntentRegistration } from './intent-repository.js';

export type RegisterTransferIntent = {
  /** From a verified JWT, never a user-supplied senderUserId. */
  authenticatedUserId: string;
  idempotencyKey: string;
  /** T-13 validated and resolved (not yet financially authorized under locks). */
  instruction: ResolvedTransferIntent;
};

/**
 * T-14's standalone transaction is for intention storage. T-15 MUST instead
 * call registerInTransaction with its own financial transaction so that the
 * intent, balances, ledger, limit and audit all commit or roll back together.
 * Do not expose PROCESSING as financial success in an HTTP response.
 */
export class TransferIntentService {
  constructor(private readonly db: DataSource) {}

  async register(input: RegisterTransferIntent): Promise<IntentRegistration> {
    return this.db.transaction('READ COMMITTED', (manager) => this.registerInTransaction(manager, input));
  }

  async registerInTransaction(
    manager: EntityManager,
    input: RegisterTransferIntent,
  ): Promise<IntentRegistration> {
    // Prevalidate BEFORE attempting any SQL. No caller-provided owner fields.
    const owner = normalizeUuid(input.authenticatedUserId);
    const key = validateIdempotencyKey(input.idempotencyKey);
    const intent = normalizeTransferIntent(input.instruction);
    const hash = hashTransferPayload(input.instruction);
    return registerIntentInTransaction(manager, owner, key, hash, intent);
  }
}
