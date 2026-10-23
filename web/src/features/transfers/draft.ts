import { z } from 'zod';
import type { components } from '@treo/shared';

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
export type TransferDraft = { form: TransferForm; request: TransferRequest; key: string; sourceLabel: string; targetLabel: string };

const uuid = z.string().uuid();
const mxn = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/, 'Ingresa un monto en MXN con hasta dos decimales.');
const schema = z.object({
  mode: z.enum(['OWN_ACCOUNTS', 'BENEFICIARY']),
  sourceAccountId: uuid,
  targetId: uuid,
  amount: mxn,
  concept: z.string().trim().min(1, 'Escribe un concepto.').max(140, 'Máximo 140 caracteres.'),
  reference: z.string().regex(/^[0-9]{1,7}$/, 'La referencia debe tener de 1 a 7 dígitos.'),
}).superRefine((value, ctx) => {
  if (value.mode === 'OWN_ACCOUNTS' && value.sourceAccountId === value.targetId) {
    ctx.addIssue({ code: 'custom', path: ['targetId'], message: 'Elige una cuenta diferente de la de origen.' });
  }
  if (/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value.amount)) {
    const cents = toCents(value.amount);
    if (cents === 0n) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'El monto debe ser mayor a cero.' });
    if (cents > 9_223_372_036_854_775_807n) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'El monto excede el rango admitido.' });
  }
});

/** Only bigint arithmetic; never Number/float for a transfer amount. */
export function toCents(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)) throw new Error('Monto inválido');
  const [pesos, dec = ''] = value.split('.');
  return BigInt(pesos!) * 100n + BigInt((dec + '00').slice(0, 2));
}
export function parseTransferForm(input: TransferForm): { request?: TransferRequest; errors: Record<string, string> } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { errors: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message])) };
  }
  const { mode, sourceAccountId, targetId, amount, concept, reference } = parsed.data;
  const base = { sourceAccountId, amount, concept, reference };
  return { errors: {}, request: mode === 'BENEFICIARY' ? { ...base, beneficiaryId: targetId } : { ...base, destinationAccountId: targetId } };
}

function newIntentKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // JSDOM may not implement randomUUID; browser cryptographic randomness is still required.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function createTransferDraft(form: TransferForm, sourceLabel: string, targetLabel: string): TransferDraft {
  const result = parseTransferForm(form);
  if (!result.request) throw new Error('No se puede crear una intención sin validar los campos.');
  return { form, request: result.request, key: newIntentKey(), sourceLabel, targetLabel };
}
