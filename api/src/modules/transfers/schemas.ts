import type { TreoCreateTransferRequest } from '@treo/shared';
import { z } from 'zod';
import { parseMxnToCents } from './money.js';

const accountId = z.string().uuid().transform((value) => value.toLowerCase());
const amount = z.string().refine((value) => {
  try {
    parseMxnToCents(value);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}, 'El importe debe ser positivo, exacto y representable en centavos BIGINT.');

const concept = z.string().trim().refine((value) => {
  // PostgreSQL text cannot store NUL or unpaired UTF-16 surrogates.
  if (value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return false;
  const length = [...value].length;
  return length >= 1 && length <= 140;
}, 'El concepto debe contener entre 1 y 140 caracteres Unicode válidos.');

/** D-04: measure concept AFTER trim, as explicitly approved for T-13. */
export const createTransferSchema = z.object({
  sourceAccountId: accountId,
  beneficiaryId: accountId.optional(),
  destinationAccountId: accountId.optional(),
  amount,
  concept,
  // Absolute end assertion also rejects trailing newlines (unlike JS $ alone).
  reference: z.string().regex(/^[0-9]{1,7}(?![\s\S])/),
}).strict().refine(
  (value) => (value.beneficiaryId !== undefined) !== (value.destinationAccountId !== undefined),
  'Especifica exactamente un beneficiario o una cuenta de destino.',
) satisfies z.ZodType<TreoCreateTransferRequest>;

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
