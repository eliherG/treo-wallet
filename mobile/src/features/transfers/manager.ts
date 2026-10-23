import { MobileAuthError } from '../../auth/controller';
import type { Account } from '../accounts/accounts';
import type { Beneficiary } from '../beneficiaries/beneficiaries';
import { validateDraft, type Transfer, type TransferForm, type TransferRequest } from './draft';
import type { TransferService } from './service';

export type PendingIntent = {
  ownerId: string;
  key: string;
  request: TransferRequest;
  sourceLabel: string;
  targetLabel: string;
  amountCents: string;
  sent: boolean;
  knownId: string | null;
};
export interface PendingIntentStore {
  read(ownerId: string): Promise<PendingIntent | null>;
  write(ownerId: string, intent: PendingIntent): Promise<void>;
  remove(ownerId: string): Promise<void>;
}
export type TransferPhase = 'editing' | 'review' | 'unknown' | 'otp' | 'completed' | 'rejected';
export type TransferState = { phase: TransferPhase; intent: PendingIntent | null; transfer: Transfer | null; error: string | null };

function assertIdempotencyKey(key: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error('La llave debe ser UUIDv4 criptográfico.');
  }
}

export class MobileTransferManager {
  state: TransferState = { phase: 'editing', intent: null, transfer: null, error: null };
  private busy = false;
  constructor(private readonly ownerId: string,
    private readonly store: PendingIntentStore,
    private readonly service: TransferService) {}

  /** A sent draft is never treated as a fresh form after app restart. */
  async restore(): Promise<TransferState> {
    const intent = await this.store.read(this.ownerId);
    if (!intent) return this.state;
    if (intent.ownerId !== this.ownerId || !intent.key || !intent.request ||
      typeof intent.sent !== 'boolean' || typeof intent.amountCents !== 'string') {
      throw new Error('Intención almacenada inválida. No se borrará automáticamente.');
    }
    this.state = { phase: intent.sent ? 'unknown' : 'review', intent, transfer: null, error: intent.sent ? 'Operación previa: consulta su estado antes de crear otra.' : null };
    // If the backend knows the ID, resolve it by GET, never by guessing the result.
    if (intent.knownId) return this.reconcile();
    return this.state;
  }

  async begin(form: TransferForm, accounts: Account[], beneficiaries: Beneficiary[], key: string): Promise<TransferState> {
    if (this.state.intent || this.busy) throw new Error('Resuelve primero la intención anterior.');
    const checked = validateDraft(form, accounts, beneficiaries);
    if (!checked.draft) throw new Error(Object.values(checked.errors)[0] ?? 'Formulario inválido.');
    assertIdempotencyKey(key);
    const intent: PendingIntent = {
      ownerId: this.ownerId, key,
      request: checked.draft.request, sourceLabel: checked.draft.sourceLabel,
      targetLabel: checked.draft.targetLabel, amountCents: checked.draft.amountCents,
      sent: false, knownId: null,
    };
    // Must persist BEFORE entering review or sending any money.
    await this.store.write(this.ownerId, intent);
    this.state = { phase: 'review', intent, transfer: null, error: null };
    return this.state;
  }

  private async accept(transfer: Transfer): Promise<TransferState> {
    const intent = this.state.intent;
    if (!intent) throw new Error('No hay una intención activa.');
    intent.knownId = transfer.id;
    intent.sent = true;
    // Save known ID before displaying server state, even if the disk fails.
    await this.store.write(this.ownerId, intent);
    this.state = {
      phase: transfer.status === 'COMPLETED' ? 'completed'
        : transfer.status === 'REJECTED' ? 'rejected'
        : transfer.status === 'PENDING_CONFIRMATION' ? 'otp' : 'unknown',
      intent, transfer,
      error: transfer.status === 'PROCESSING' ? 'La operación continúa en proceso. Consulta el estado.' : null,
    };
    return this.state;
  }

  private markUnknown(error: unknown): TransferState {
    this.state = {
      ...this.state, phase: 'unknown',
      error: `UNKNOWN_RESULT: ${error instanceof Error ? error.message : 'Sin respuesta confirmada.'} Consulta o reintenta la misma intención.`,
    };
    return this.state;
  }

  async submit(): Promise<TransferState> {
    if (this.busy) return this.state; // synchronously disallow double tap
    const intent = this.state.intent;
    if (!intent || (this.state.phase !== 'review' && this.state.phase !== 'unknown') || intent.knownId) return this.state;
    this.busy = true;
    try {
      intent.sent = true;
      // Preflight persistence: fail safely without sending if SecureStore is unavailable.
      await this.store.write(this.ownerId, intent);
      this.state = { ...this.state, phase: 'unknown', error: null };
      return await this.accept(await this.service.send(intent.request, intent.key));
    } catch (error) {
      // Definitive validation errors don't debit funds. Discard this key and permit corrections.
      if (error instanceof MobileAuthError &&
        [400, 403, 422, 429].includes(error.status) && error.code !== 'TRANSFER_IN_PROGRESS') {
        await this.store.remove(this.ownerId);
        this.state = { phase: 'editing', intent: null, transfer: null, error: `${error.message} (${error.code})` };
        return this.state;
      }
      return this.markUnknown(error);
    } finally { this.busy = false; }
  }

  async reconcile(): Promise<TransferState> {
    if (this.busy) return this.state;
    const id = this.state.intent?.knownId;
    if (!id) return this.state;
    this.busy = true;
    try { return await this.accept(await this.service.get(id)); }
    catch (error) { return this.markUnknown(error); }
    finally { this.busy = false; }
  }

  async confirm(otp: string): Promise<TransferState> {
    if (this.busy) return this.state;
    const id = this.state.intent?.knownId;
    if (!id || this.state.phase !== 'otp') return this.state;
    if (!/^[0-9]{6}$/.test(otp)) {
      this.state = { ...this.state, error: 'El OTP debe tener seis dígitos.' };
      return this.state;
    }
    this.busy = true;
    try { return await this.accept(await this.service.confirm(id, otp)); }
    catch (error) {
      if (error instanceof MobileAuthError && error.status >= 400 && error.status < 500 && error.status !== 409) {
        this.state = { ...this.state, error: `${error.message} (${error.code})` };
        return this.state;
      }
      return this.markUnknown(error); // OTP might have been applied. GET status next.
    } finally { this.busy = false; }
  }

  /** Only abandon when no write was sent, or when the server confirms final status. */
  async reset(): Promise<TransferState> {
    if (this.busy || (this.state.intent?.sent && !['completed', 'rejected'].includes(this.state.phase))) {
      throw new Error('Primero resuelve el estado de la transferencia en curso.');
    }
    await this.store.remove(this.ownerId);
    this.state = { phase: 'editing', intent: null, transfer: null, error: null };
    return this.state;
  }
}
