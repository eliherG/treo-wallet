import type { components } from '@treo/shared';
import type { Account } from '../accounts/accounts';
import type { Beneficiary } from '../beneficiaries/beneficiaries';

export type TransferRequest = components['schemas']['CreateTransferRequest'];
export type Transfer = components['schemas']['Transfer'];
export type TransferResponse = components['schemas']['TransferResponse'];
export type TransferMode = 'OWN_ACCOUNTS' | 'BENEFICIARY';
export type TransferForm = {
  mode: TransferMode;
  sourceAccountId: string;
  targetId: string;
  amount: string;
  concept: string;
  reference: string;
};
export type ValidatedDraft = {
  request: TransferRequest;
  sourceLabel: string;
  targetLabel: string;
  amountCents: string;
};

/** Convert exact decimal MXN to integer cents without IEEE-754 rounding. */
export function toCents(input: string): bigint {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(input)) throw new Error('Monto MXN inválido.');
  const [whole, fraction = ''] = input.split('.');
  return BigInt(whole!) * 100n + BigInt((fraction + '00').slice(0, 2));
}

export function validateDraft(
  form: TransferForm, accounts: Account[], beneficiaries: Beneficiary[],
): { draft?: ValidatedDraft; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const source = accounts.find(account => account.id === form.sourceAccountId);
  if (!source || source.status !== 'ACTIVE') errors.sourceAccountId = 'Selecciona una cuenta de origen activa.';
  let targetLabel = '';
  if (form.mode === 'OWN_ACCOUNTS') {
    const target = accounts.find(account => account.id === form.targetId);
    if (!target || target.status !== 'ACTIVE' || target.id === source?.id) {
      errors.targetId = 'Selecciona otra cuenta propia activa.';
    } else targetLabel = `Cuenta propia ${target.clabeMasked}`;
  } else if (form.mode === 'BENEFICIARY') {
    const target = beneficiaries.find(beneficiary => beneficiary.id === form.targetId);
    if (!target || !target.isInternal) errors.targetId = 'Solo se permiten beneficiarios internos registrados.';
    else targetLabel = `${target.alias} · ${target.clabeMasked}`;
  } else errors.targetId = 'Tipo de transferencia inválido.';

  let amountCents = '0';
  try {
    const amount = toCents(form.amount);
    if (amount <= 0n || amount > 9_223_372_036_854_775_807n) throw new Error('Fuera de rango.');
    amountCents = amount.toString();
  } catch { errors.amount = 'Monto positivo en MXN, máximo dos decimales y sin redondeos.'; }
  const concept = form.concept.trim();
  if (!concept || concept.length > 140) errors.concept = 'El concepto debe tener de 1 a 140 caracteres.';
  if (!/^[0-9]{1,7}$/.test(form.reference)) errors.reference = 'La referencia debe contener entre 1 y 7 dígitos.';
  if (Object.keys(errors).length || !source) return { errors };
  const base = { sourceAccountId: source.id, amount: form.amount, concept, reference: form.reference };
  return {
    errors: {},
    draft: {
      request: form.mode === 'BENEFICIARY' ? { ...base, beneficiaryId: form.targetId }
        : { ...base, destinationAccountId: form.targetId },
      sourceLabel: `Cuenta ${source.clabeMasked}`, targetLabel, amountCents,
    },
  };
}
