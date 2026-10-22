import type { EntityManager } from 'typeorm';
import { HttpProblem } from '../../http/http-problem.js';
import type { NormalizedTransferIntent } from './idempotency.js';
import { OTP_THRESHOLD_CENTS } from './idempotency.js';

export type IntentStatus = 'PROCESSING' | 'PENDING_CONFIRMATION' | 'COMPLETED' | 'REJECTED';

export type PersistedIntent = {
  transferId: string;
  status: IntentStatus;
  requiresOtp: boolean;
};

export type IntentRegistration = PersistedIntent & { disposition: 'CREATED' | 'REPLAYED' };

type TransferRow = {
  id: string;
  payload_hash: string;
  status: IntentStatus;
  requires_otp: boolean;
};

type QueryRow = { id: string };

/** TypeORM's PostgreSQL raw query shape can be [rows, rowCount] for INSERT/UPDATE. */
function returnedRows(raw: unknown): QueryRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: unknown = Array.isArray(raw[0]) ? raw[0] : raw;
  return Array.isArray(rows) ? rows as QueryRow[] : [];
}

/**
 * Run inside the caller's READ COMMITTED transaction. Under contention,
 * ON CONFLICT waits for the winner; the following SELECT uses a fresh snapshot.
 * No SELECT-before-INSERT race and no catch inside an aborted PG transaction.
 */
export async function registerIntentInTransaction(
  manager: EntityManager,
  actorUserId: string,
  idempotencyKey: string,
  hash: string,
  instruction: NormalizedTransferIntent,
): Promise<IntentRegistration> {
  const inserted = await manager.query(`
    INSERT INTO transfers (
      sender_user_id, source_account_id, destination_account_id, beneficiary_id,
      kind, amount_cents, concept, reference, idempotency_key, payload_hash,
      status, requires_otp
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PROCESSING', $11
    )
    ON CONFLICT (sender_user_id, idempotency_key) DO NOTHING
    RETURNING id
  `, [
    actorUserId,
    instruction.sourceAccountId,
    instruction.destinationAccountId,
    instruction.beneficiaryId,
    instruction.kind,
    instruction.amountCents.toString(),
    instruction.concept,
    instruction.reference,
    idempotencyKey,
    hash,
    instruction.amountCents > OTP_THRESHOLD_CENTS,
  ]) as unknown;

  // New statement at READ COMMITTED sees the committed winning row even when
  // a concurrent insert initially conflicted with an uncommitted transaction.
  const rows = await manager.query(`
    SELECT id, payload_hash, status, requires_otp
      FROM transfers
     WHERE sender_user_id = $1 AND idempotency_key = $2
  `, [actorUserId, idempotencyKey]) as TransferRow[];
  const persisted = rows[0];
  if (!persisted) throw new Error('Intent was not visible after conflict resolution');
  if (persisted.payload_hash !== hash) {
    throw new HttpProblem(409, 'IDEMPOTENCY_CONFLICT', 'Conflicto de idempotencia',
      'La clave de idempotencia ya fue utilizada para una instrucción distinta.');
  }
  const created = returnedRows(inserted).some((row) => row.id === persisted.id);
  return {
    disposition: created ? 'CREATED' : 'REPLAYED',
    transferId: persisted.id,
    status: persisted.status,
    requiresOtp: persisted.requires_otp,
  };
}
