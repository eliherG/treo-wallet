import type { DataSource, EntityManager } from 'typeorm';
import { z } from 'zod';
import { HttpProblem } from '../../http/http-problem.js';
import type { PublicTransfer } from './atomic-transfer.service.js';

const uuid = z.string().uuid();

type TransferRow = {
  id: string;
  status: PublicTransfer['status'];
  kind: PublicTransfer['kind'];
  source_account_id: string;
  amount_cents: string;
  concept: string;
  reference: string;
  requires_otp: boolean;
  created_at: Date;
  completed_at: Date | null;
  rejection_code: string | null;
  destination_clabe: string | null;
};

/** T-17: only persisted facts; no changes to transfers, accounts, or ledger. */
export class TransferStatusService {
  constructor(private readonly db: DataSource) {}

  async get(actor: string, transferId: string): Promise<PublicTransfer> {
    return this.getWithManager(this.db.manager, actor, transferId);
  }

  async getWithManager(manager: EntityManager, actor: string, transferId: string): Promise<PublicTransfer> {
    const user = uuid.safeParse(actor);
    if (!user.success) {
      throw new HttpProblem(401, 'UNAUTHORIZED', 'No autorizado', 'Se requiere una sesión válida.');
    }
    const identifier = uuid.safeParse(transferId);
    if (!identifier.success) {
      throw new HttpProblem(400, 'INVALID_TRANSFER_ID', 'Identificador inválido',
        'El identificador de transferencia debe ser un UUID válido.');
    }
    // The sender filter is intentionally in SQL, not checked after fetching.
    // This makes foreign and non-existent transfers indistinguishable.
    const rows = await manager.query(`
      SELECT t.id, t.status, t.kind, t.source_account_id, t.amount_cents,
             t.concept, t.reference, t.requires_otp, t.created_at,
             t.completed_at, t.rejection_code,
             a.clabe AS destination_clabe
        FROM transfers t
        LEFT JOIN accounts a ON a.id = t.destination_account_id
       WHERE t.id = $1::uuid AND t.sender_user_id = $2::uuid
       LIMIT 1
    `, [identifier.data.toLowerCase(), user.data.toLowerCase()]) as TransferRow[];
    const transfer = rows[0];
    if (!transfer) {
      throw new HttpProblem(404, 'TRANSFER_NOT_FOUND', 'Transferencia no encontrada',
        'La transferencia no está disponible.');
    }
    const last4 = transfer.destination_clabe?.slice(-4);
    const masked = last4 && /^\d{4}$/.test(last4)
      ? `${'*'.repeat(14)}${last4}` : '*'.repeat(18);
    // The OpenAPI TransferResponse contract wraps this object in { transfer }.
    // A COMPLETED response is the receipt: completedAt and masked metadata are
    // persisted. For PROCESSING/PENDING/REJECTED, completedAt remains null;
    // the client must not display a final receipt for those statuses.
    return {
      id: transfer.id,
      status: transfer.status,
      kind: transfer.kind,
      sourceAccountId: transfer.source_account_id,
      destinationAccountMasked: masked,
      amountCents: transfer.amount_cents,
      concept: transfer.concept,
      reference: transfer.reference,
      requiresOtp: transfer.requires_otp,
      createdAt: transfer.created_at.toISOString(),
      completedAt: transfer.completed_at?.toISOString() ?? null,
      rejectionCode: transfer.rejection_code,
    };
  }
}
