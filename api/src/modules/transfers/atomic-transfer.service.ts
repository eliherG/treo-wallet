import type { DataSource, EntityManager } from 'typeorm';
import { createOtpHash, verifyOtp, type OtpPolicy } from './otp.js';
import { HttpProblem } from '../../http/http-problem.js';
import { normalizeUuid, hashTransferPayload, normalizeTransferIntent,
  OTP_THRESHOLD_CENTS, validateIdempotencyKey, type ResolvedTransferIntent, type NormalizedTransferIntent } from './idempotency.js';
import { registerIntentInTransaction } from './intent-repository.js';
import { createTransferSchema, type CreateTransferInput } from './schemas.js';
import { parseMxnToCents } from './money.js';
import { validateTransferInstruction } from './validation.js';

const DAILY_LIMIT_CENTS = 2_000_000n;
const PG_BIGINT_MAX = 9_223_372_036_854_775_807n;

type Row = {
  id: string;
  status: 'PROCESSING' | 'PENDING_CONFIRMATION' | 'COMPLETED' | 'REJECTED';
  kind: 'BENEFICIARY' | 'OWN_ACCOUNTS';
  source_account_id: string;
  destination_account_id: string | null;
  amount_cents: string;
  concept: string;
  reference: string;
  requires_otp: boolean;
  rejection_code: string | null;
  created_at: Date;
  completed_at: Date | null;
  payload_hash: string;
  destination_clabe: string | null;
  beneficiary_id: string | null;
  idempotency_key: string;
};
type BalanceRow = { id: string; balance_cents: string };
type DateRow = { business_date: string };
type UsageRow = { spent_cents: string };

export type PublicTransfer = {
  id: string;
  status: Row['status'];
  kind: Row['kind'];
  sourceAccountId: string;
  destinationAccountMasked: string;
  amountCents: string;
  concept: string;
  reference: string;
  requiresOtp: boolean;
  createdAt: string;
  completedAt: string | null;
  rejectionCode: string | null;
};

export type SubmitTransferInput = {
  /** Always derived from the verified access JWT. */
  authenticatedUserId: string;
  idempotencyKey: string;
  payload: unknown;
  requestId?: string;
};

export type SubmitTransferResult =
  | { outcome: 'COMPLETED' | 'PENDING_CONFIRMATION'; transfer: PublicTransfer; replayed: boolean }
  | { outcome: 'ERROR'; problem: HttpProblem; transferId: string | null };

function publicTransfer(row: Row): PublicTransfer {
  const lastFour = row.destination_clabe?.slice(-4);
  const destinationAccountMasked = lastFour && /^[0-9]{4}$/.test(lastFour)
    ? `${'*'.repeat(14)}${lastFour}` : '*'.repeat(18);
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    sourceAccountId: row.source_account_id,
    destinationAccountMasked,
    amountCents: row.amount_cents,
    concept: row.concept,
    reference: row.reference,
    requiresOtp: row.requires_otp,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    rejectionCode: row.rejection_code,
  };
}

function failure(code: string): HttpProblem {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return new HttpProblem(422, code, 'Saldo insuficiente', 'La cuenta de origen no tiene fondos suficientes.');
    case 'DAILY_LIMIT_EXCEEDED':
      return new HttpProblem(422, code, 'Límite diario excedido', 'La transferencia excede el cupo diario disponible.');
    case 'DESTINATION_BALANCE_LIMIT':
      return new HttpProblem(422, code, 'Destino no disponible', 'No es posible acreditar el importe al destino.');
    case 'ACCOUNT_UNAVAILABLE':
      return new HttpProblem(422, code, 'Cuenta no disponible', 'La cuenta no está disponible para transferencias.');
    default:
      return new HttpProblem(422, code, 'Transferencia rechazada', 'La transferencia no pudo completarse.');
  }
}

function asBusinessFailure(error: unknown): HttpProblem | null {
  return error instanceof HttpProblem && error.status >= 400 && error.status < 500 ? error : null;
}

function targetFromRequest(request: CreateTransferInput & { amountCents: bigint }): ResolvedTransferIntent {
  const common = {
    sourceAccountId: request.sourceAccountId,
    amountCents: request.amountCents,
    concept: request.concept,
    reference: request.reference,
  };
  if (request.beneficiaryId !== undefined) {
    return { ...common, kind: 'BENEFICIARY', beneficiaryId: request.beneficiaryId,
      destinationAccountId: null };
  }
  return { ...common, kind: 'OWN_ACCOUNTS', destinationAccountId: request.destinationAccountId! };
}

async function storedIntent(manager: EntityManager, actor: string, key: string): Promise<Row | null> {
  const rows = await manager.query(`
    SELECT t.id, t.status, t.kind, t.source_account_id, t.destination_account_id, t.beneficiary_id, t.idempotency_key,
           t.amount_cents, t.concept, t.reference, t.requires_otp,
           t.rejection_code, t.created_at, t.completed_at, t.payload_hash,
           a.clabe AS destination_clabe
      FROM transfers t
      LEFT JOIN accounts a ON a.id = t.destination_account_id
     WHERE t.sender_user_id = $1 AND t.idempotency_key = $2
  `, [actor, key]) as Row[];
  return rows[0] ?? null;
}

function resolveReplay(row: Row, expectedHash: string): SubmitTransferResult {
  if (row.payload_hash !== expectedHash) {
    return { outcome: 'ERROR', problem: new HttpProblem(409, 'IDEMPOTENCY_CONFLICT',
      'Conflicto de idempotencia', 'La llave ya fue utilizada para otra instrucción.'), transferId: row.id };
  }
  if (row.status === 'COMPLETED') return { outcome: 'COMPLETED', transfer: publicTransfer(row), replayed: true };
  if (row.status === 'PENDING_CONFIRMATION') return { outcome: 'PENDING_CONFIRMATION', transfer: publicTransfer(row), replayed: true };
  if (row.status === 'REJECTED') {
    return { outcome: 'ERROR', problem: failure(row.rejection_code ?? 'TRANSFER_REJECTED'), transferId: row.id };
  }
  // Never report a PROCESSING / OTP-less pending attempt as a successful transfer.
  return { outcome: 'ERROR', problem: new HttpProblem(409, 'TRANSFER_IN_PROGRESS',
    'Transferencia en curso', 'La operación todavía no tiene un resultado definitivo.'), transferId: row.id };
}

async function lockAccounts(manager: EntityManager, sourceId: string, destinationId: string):
  Promise<Map<string, BalanceRow>> {
  const locked = new Map<string, BalanceRow>();
  // Separate statements force deterministic row-lock order; ORDER BY inside one
  // SELECT ... FOR UPDATE does not guarantee the actual order of row locks.
  for (const id of [sourceId, destinationId].sort()) {
    const rows = await manager.query(`
      SELECT id, balance_cents FROM accounts WHERE id = $1 FOR UPDATE
    `, [id]) as BalanceRow[];
    const account = rows[0];
    if (!account) throw new HttpProblem(404, 'RESOURCE_NOT_FOUND', 'Cuenta no encontrada',
      'La cuenta no está disponible.');
    locked.set(id, account);
  }
  return locked;
}

async function reject(manager: EntityManager, id: string, reason: HttpProblem): Promise<SubmitTransferResult> {
  await manager.query(`UPDATE transfers SET status = 'REJECTED', rejection_code = $2 WHERE id = $1
                       AND status = 'PROCESSING'`, [id, reason.code]);
  // Commit the REJECTED intention with zero ledger entries and zero money changes.
  return { outcome: 'ERROR', problem: reason, transferId: id };
}

/**
 * T-15: the caller owns exactly one READ COMMITTED transaction. On success,
 * the intention, user+account locking, balances, ledger, quota and audit must
 * commit together. Caller may pass a rollback-only test transaction.
 */
export class AtomicTransferService {
  constructor(private readonly db: DataSource, private readonly otpPolicy?: OtpPolicy) {}

  async submit(input: SubmitTransferInput): Promise<SubmitTransferResult> {
    return this.db.transaction('READ COMMITTED', (tx) => this.submitInTransaction(tx, input));
  }

  async submitInTransaction(manager: EntityManager, input: SubmitTransferInput): Promise<SubmitTransferResult> {
    const actor = normalizeUuid(input.authenticatedUserId);
    let key: string;
    try {
      key = validateIdempotencyKey(input.idempotencyKey);
      if (!key.trim()) throw new RangeError('Blank idempotency key');
    } catch {
      return { outcome: 'ERROR', problem: new HttpProblem(400, 'INVALID_IDEMPOTENCY_KEY',
        'Llave inválida', 'La llave de idempotencia debe tener entre 8 y 128 caracteres.'), transferId: null };
    }
    // A route also runs validateBody. This parse keeps the service safe when
    // invoked from a worker/test without Express.
    const request = createTransferSchema.parse(input.payload);
    const amountCents = parseMxnToCents(request.amount);
    const immutableTarget = targetFromRequest({ ...request, amountCents });
    const payloadHash = hashTransferPayload(immutableTarget);

    // Replay *before* preflight: a previously completed attempt must remain
    // retrievable even when accounts, beneficiary or available funds change.
    const previous = await storedIntent(manager, actor, key);
    if (previous) return resolveReplay(previous, payloadHash);

    // Preflight: reads without account locks to discover the intended destination.
    // This is not the final financial authorization.
    const preflight = await validateTransferInstruction(manager, actor, request);
    const resolved: ResolvedTransferIntent = preflight.kind === 'BENEFICIARY'
      ? { kind: 'BENEFICIARY', sourceAccountId: preflight.sourceAccountId,
        beneficiaryId: preflight.beneficiaryId!, destinationAccountId: preflight.destinationAccountId,
        amountCents: preflight.amountCents, concept: preflight.concept, reference: preflight.reference }
      : { kind: 'OWN_ACCOUNTS', sourceAccountId: preflight.sourceAccountId,
        destinationAccountId: preflight.destinationAccountId, amountCents: preflight.amountCents,
        concept: preflight.concept, reference: preflight.reference };
    const normalized = normalizeTransferIntent(resolved);

    // Acquire row locks before INSERT to avoid FK KEY SHARE
    // lock-upgrade deadlocks during concurrent transfers.
    const senderRows = await manager.query(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [actor],
    ) as Array<{ id: string }>;

    if (senderRows.length !== 1) {
      throw new HttpProblem(
        401, 'UNAUTHORIZED', 'No autorizado', 'Sesión inválida.',
      );
    }

    if (!normalized.destinationAccountId) {
      throw new Error('Transfer destination missing');
    }

    await lockAccounts(
      manager,
      normalized.sourceAccountId,
      normalized.destinationAccountId,
    );

    // The ON CONFLICT unique key serializes same-key inserts. This is part of
    // the SAME transaction as ledger and funds. T-14 stand-alone register()
    // must NOT be used from T-15.
    const registration = await registerIntentInTransaction(manager, actor, key, payloadHash, normalized);
    if (registration.disposition === 'REPLAYED') {
      const settled = await storedIntent(manager, actor, key);
      if (!settled) throw new Error('Transfer disappeared after conflict resolution');
      return resolveReplay(settled, payloadHash);
    }

    if (amountCents > OTP_THRESHOLD_CENTS) {
      // No balance change and no daily quota until the OTP is confirmed.
      const codeHash = createOtpHash(registration.transferId, this.otpPolicy);
      await manager.query(`INSERT INTO otp_challenges(transfer_id,code_hash,expires_at)
        VALUES($1,$2,clock_timestamp() + INTERVAL '5 minutes')`,
      [registration.transferId, codeHash]);
      await manager.query(`UPDATE transfers SET status='PENDING_CONFIRMATION'
        WHERE id=$1 AND status='PROCESSING'`, [registration.transferId]);
      const pending = await storedIntent(manager, actor, key);
      if (!pending || pending.status !== 'PENDING_CONFIRMATION') throw new Error('OTP pending state not persisted');
      return { outcome: 'PENDING_CONFIRMATION', transfer: publicTransfer(pending), replayed: false };
    }
    return this.completeTransfer(manager, actor, key, normalized, request,
      registration.transferId, input.requestId);
  }

  async confirm(input: { authenticatedUserId: string; transferId: string; otp: string; requestId?: string }): Promise<SubmitTransferResult> {
    return this.db.transaction('READ COMMITTED', tx => this.confirmInTransaction(tx, input));
  }

  async confirmInTransaction(manager: EntityManager, input: {
    authenticatedUserId: string; transferId: string; otp: string; requestId?: string;
  }): Promise<SubmitTransferResult> {
    const actor = normalizeUuid(input.authenticatedUserId);
    const transferId = normalizeUuid(input.transferId);
    if (typeof input.otp !== 'string' || !/^[0-9]{6}$/.test(input.otp)) {
      return { outcome: 'ERROR', transferId, problem: new HttpProblem(400, 'INVALID_OTP',
        'Código inválido', 'Introduce un código de seis dígitos.') };
    }
    // Lock the intent first: two simultaneous confirmations cannot spend twice.
    const rows = await manager.query(`SELECT id, status, sender_user_id, idempotency_key,
       source_account_id, destination_account_id, beneficiary_id, amount_cents, concept,
       reference, kind, requires_otp FROM transfers
       WHERE id=$1 AND sender_user_id=$2 FOR UPDATE`, [transferId, actor]) as Array<{
       id:string; status:Row['status'];sender_user_id:string;idempotency_key:string;
       source_account_id:string; destination_account_id:string|null; beneficiary_id:string|null;
       amount_cents:string; concept:string;reference:string;kind:Row['kind'];requires_otp:boolean;
    }>;
    const intent = rows[0];
    if (!intent) return { outcome:'ERROR',transferId:null,problem:new HttpProblem(404,'TRANSFER_NOT_FOUND',
      'Transferencia no encontrada','La transferencia no está disponible.') };
    const existing = await storedIntent(manager, actor, intent.idempotency_key);
    if (!existing) throw new Error('Locked intention cannot be read');
    if (existing.status === 'COMPLETED') return { outcome:'COMPLETED',transfer:publicTransfer(existing),replayed:true };
    if (existing.status === 'REJECTED') return { outcome:'ERROR',transferId,problem:failure(existing.rejection_code ?? 'TRANSFER_REJECTED') };
    if (existing.status !== 'PENDING_CONFIRMATION' || !intent.requires_otp) {
      return { outcome:'ERROR',transferId,problem:new HttpProblem(409,'TRANSFER_IN_PROGRESS',
        'Transferencia en curso','La intención no está pendiente de OTP.') };
    }
    const challenges = await manager.query(`SELECT id,code_hash,failed_attempts,used_at,
      (expires_at <= clock_timestamp()) AS expired FROM otp_challenges
      WHERE transfer_id=$1 FOR UPDATE`, [transferId]) as Array<{
      id:string;code_hash:string;failed_attempts:number;used_at:Date|null;expired:boolean;
    }>;
    const challenge = challenges[0];
    if (!challenge) throw new Error('Pending transfer missing OTP challenge');
    if (challenge.used_at || challenge.expired || challenge.failed_attempts >= 3) {
      const code = challenge.expired ? 'OTP_EXPIRED' : 'OTP_ATTEMPTS_EXCEEDED';
      await manager.query(`UPDATE transfers SET status='REJECTED',rejection_code=$2 WHERE id=$1
        AND status='PENDING_CONFIRMATION'`, [transferId,code]);
      return { outcome:'ERROR',transferId,problem:new HttpProblem(422,code,
        'Confirmación rechazada','El código ha expirado o agotado sus intentos.') };
    }
    if (!verifyOtp(transferId, input.otp, challenge.code_hash, this.otpPolicy)) {
      const nextAttempts = challenge.failed_attempts + 1;
      await manager.query(`UPDATE otp_challenges SET failed_attempts=$2 WHERE id=$1`,
        [challenge.id,nextAttempts]);
      if (nextAttempts >= 3) await manager.query(`UPDATE transfers
        SET status='REJECTED',rejection_code='OTP_ATTEMPTS_EXCEEDED'
        WHERE id=$1 AND status='PENDING_CONFIRMATION'`,[transferId]);
      return { outcome:'ERROR',transferId,problem:new HttpProblem(422,
        nextAttempts >= 3 ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID',
        'Código incorrecto','No se pudo confirmar el código.') };
    }
    // Mark the single-use challenge consumed *inside* the financial transaction.
    await manager.query(`UPDATE otp_challenges SET used_at=clock_timestamp() WHERE id=$1
      AND used_at IS NULL`, [challenge.id]);
    await manager.query(`UPDATE transfers SET status='PROCESSING' WHERE id=$1
      AND status='PENDING_CONFIRMATION'`, [transferId]);
    const cents = BigInt(intent.amount_cents);
    const pesos = (cents / 100n).toString();
    const fraction = (cents % 100n).toString().padStart(2,'0');
    const request: CreateTransferInput = {
      sourceAccountId:intent.source_account_id,
      ...(intent.kind === 'BENEFICIARY'
        ? { beneficiaryId:intent.beneficiary_id! }
        : { destinationAccountId:intent.destination_account_id! }),
      amount:`${pesos}.${fraction}`, concept:intent.concept, reference:intent.reference,
    };
    const normalized:NormalizedTransferIntent = {
      kind:intent.kind, sourceAccountId:intent.source_account_id,
      destinationAccountId:intent.destination_account_id,
      beneficiaryId:intent.beneficiary_id,amountCents:cents,
      concept:intent.concept,reference:intent.reference,
    };
    return this.completeTransfer(manager,actor,intent.idempotency_key,normalized,request,
      transferId,input.requestId);
  }

  private async completeTransfer(manager:EntityManager, actor:string,key:string,
    normalized:NormalizedTransferIntent,request:CreateTransferInput,transferId:string,
    requestId?:string):Promise<SubmitTransferResult> {
    // 1. Lock sender row first to serialize all accounts' daily consumption.
    const userRows = await manager.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [actor]) as Array<{id:string}>;
    if (userRows.length !== 1) throw new HttpProblem(401, 'UNAUTHORIZED', 'No autorizado', 'Sesión inválida.');
    // 2. Lock BOTH accounts individually in ascending canonical UUID order.
    const locked = await lockAccounts(manager, normalized.sourceAccountId,
      normalized.destinationAccountId!);

    // 3. Revalidate under locks: identity, beneficiary->CLABE resolution,
    // ownership, blocked accounts and MXN. If destination changed while
    // acquiring locks, fail closed (never debit another un-locked account).
    try {
      const current = await validateTransferInstruction(manager, actor, request);
      if (current.sourceAccountId !== normalized.sourceAccountId ||
          current.destinationAccountId !== normalized.destinationAccountId ||
          current.kind !== normalized.kind) {
        return reject(manager, transferId, new HttpProblem(422, 'DESTINATION_CHANGED',
          'Destino no disponible', 'El destino cambió durante la operación.'));
      }
    } catch (error) {
      const business = asBusinessFailure(error);
      if (business) return reject(manager, transferId, business);
      throw error;
    }

    const source = locked.get(normalized.sourceAccountId);
    const destination = locked.get(normalized.destinationAccountId!);
    if (!source || !destination) throw new Error('Account locks were not acquired');
    const balance = BigInt(source.balance_cents);
    const receiving = BigInt(destination.balance_cents);
    const amount = normalized.amountCents;
    if (balance < amount) return reject(manager, transferId, failure('INSUFFICIENT_FUNDS'));
    if (receiving > PG_BIGINT_MAX - amount) {
      return reject(manager, transferId, failure('DESTINATION_BALANCE_LIMIT'));
    }

    // Business date obtained from POSTGRES after acquiring sender + account locks.
    const dates = await manager.query(`
      SELECT (clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date::text AS business_date
    `) as DateRow[];
    const businessDate = dates[0]?.business_date;
    if (!businessDate) throw new Error('PostgreSQL did not return business date');
    const usageRows = await manager.query(`
      SELECT spent_cents FROM daily_transfer_usage
       WHERE user_id = $1 AND business_date = $2::date FOR UPDATE
    `, [actor, businessDate]) as UsageRow[];
    const spent = BigInt(usageRows[0]?.spent_cents ?? '0');
    if (spent + amount > DAILY_LIMIT_CENTS) {
      return reject(manager, transferId, failure('DAILY_LIMIT_EXCEEDED'));
    }

    // All subsequent SQL is atomic: ANY error must abort/ROLL BACK everything.
    const debit = await manager.query(`
      UPDATE accounts SET balance_cents = balance_cents - $2::bigint
       WHERE id = $1 AND balance_cents >= $2::bigint RETURNING id
    `, [normalized.sourceAccountId, amount.toString()]) as unknown;
    const credit = await manager.query(`
      UPDATE accounts SET balance_cents = balance_cents + $2::bigint
       WHERE id = $1 AND balance_cents <= (9223372036854775807::bigint - $2::bigint)
       RETURNING id
    `, [normalized.destinationAccountId, amount.toString()]) as unknown;
    function affected(raw: unknown): boolean {
      if (!Array.isArray(raw)) return false;
      const rows: unknown = Array.isArray(raw[0]) ? raw[0] : raw;
      return Array.isArray(rows) && rows.length === 1;
    }
    if (!affected(debit) || !affected(credit)) throw new Error('Locked balance update invariant violated');
    await manager.query(`
      INSERT INTO daily_transfer_usage(user_id,business_date,spent_cents)
      VALUES($1,$2::date,$3::bigint)
      ON CONFLICT (user_id,business_date)
      DO UPDATE SET spent_cents = daily_transfer_usage.spent_cents + EXCLUDED.spent_cents
    `, [actor, businessDate, amount.toString()]);

    await manager.query(`
      INSERT INTO ledger_entries(transfer_id,account_id,type,signed_amount_cents)
      VALUES($1,$2,'DEBIT',$3::bigint),($1,$4,'CREDIT',$5::bigint)
    `, [transferId, normalized.sourceAccountId, (-amount).toString(),
      normalized.destinationAccountId, amount.toString()]);
    await manager.query(`
      UPDATE transfers SET status='COMPLETED', completed_at=clock_timestamp()
       WHERE id=$1 AND status='PROCESSING'
    `, [transferId]);
    // Only sanitized, non-secret metadata. No tokens, full CLABEs or payload.
    await manager.query(`
      INSERT INTO audit_events(actor_user_id,transfer_id,action,request_id,metadata_sanitized)
      VALUES($1,$2,'TRANSFER_COMPLETED',$3, jsonb_build_object('kind',$4::text,'amountCents',$5::text))
    `, [actor, transferId, requestId ?? null,
      normalized.kind, amount.toString()]);
    const completed = await storedIntent(manager, actor, key);
    if (!completed || completed.status !== 'COMPLETED') throw new Error('Completed transfer not visible');
    return { outcome: 'COMPLETED', transfer: publicTransfer(completed), replayed: false };
  }
}
