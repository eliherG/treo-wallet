import { createHash } from 'node:crypto';

/**
 * T-14 consumes T-13-validated and resolved instructions. T-15 MUST run T-13
 * validation before calling this layer and recheck financial facts under locks.
 * The resolved beneficiary destination is persisted but is NOT part of the
 * user's immutable request fingerprint: beneficiaryId is the request target.
 */
export type ResolvedTransferIntent = {
  sourceAccountId: string;
  amountCents: bigint;
  concept: string;
  reference: string;
} & (
  | { kind: 'OWN_ACCOUNTS'; destinationAccountId: string; beneficiaryId?: never }
  | { kind: 'BENEFICIARY'; beneficiaryId: string; destinationAccountId: string | null }
);

export const PG_BIGINT_MAX = 9_223_372_036_854_775_807n;
export const OTP_THRESHOLD_CENTS = 500_000n; // D-07: strictly greater than MXN 5,000.00.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OpenAPI header: 8–128 characters; do NOT trim or silently change client keys. */
export function validateIdempotencyKey(key: unknown): string {
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    throw new RangeError('Invalid Idempotency-Key length');
  }
  return key;
}

export function normalizeUuid(input: string): string {
  if (typeof input !== 'string' || !uuid.test(input)) {
    throw new RangeError('Invalid UUID in transfer instruction');
  }
  return input.toLowerCase();
}

/**
 * Recheck *structural* invariants. This is not ownership/financial validation.
 * T-13 validates the payload and resolves ownership and internal accounts.
 */
function validatedInstruction(input: ResolvedTransferIntent): {
  sourceAccountId: string;
  destinationAccountId: string | null;
  beneficiaryId: string | null;
  amountCents: bigint;
  concept: string;
  reference: string;
  kind: 'BENEFICIARY' | 'OWN_ACCOUNTS';
} {
  if (!input || typeof input !== 'object') throw new RangeError('Missing transfer instruction');
  if (typeof input.amountCents !== 'bigint' || input.amountCents <= 0n
    || input.amountCents > PG_BIGINT_MAX) {
    throw new RangeError('Invalid amount in cents');
  }
  if (typeof input.concept !== 'string' || input.concept.trim().length < 1
    || [...input.concept.trim()].length > 140 || input.concept !== input.concept.trim()) {
    throw new RangeError('Invalid normalized concept');
  }
  if (typeof input.reference !== 'string' || !/^[0-9]{1,7}$/.test(input.reference)) {
    throw new RangeError('Invalid numeric reference');
  }
  const sourceAccountId = normalizeUuid(input.sourceAccountId);
  if (input.kind === 'OWN_ACCOUNTS') {
    if (input.beneficiaryId !== undefined) throw new RangeError('Ambiguous destination');
    const destinationAccountId = normalizeUuid(input.destinationAccountId);
    if (sourceAccountId === destinationAccountId) throw new RangeError('Same source and destination');
    return { kind: input.kind, sourceAccountId, destinationAccountId, beneficiaryId: null,
      amountCents: input.amountCents, concept: input.concept, reference: input.reference };
  }
  if (input.kind === 'BENEFICIARY') {
    const beneficiaryId = normalizeUuid(input.beneficiaryId);
    const destinationAccountId = input.destinationAccountId === null ? null
      : normalizeUuid(input.destinationAccountId);
    if (destinationAccountId === sourceAccountId) throw new RangeError('Same source and destination');
    return { kind: input.kind, sourceAccountId, destinationAccountId, beneficiaryId,
      amountCents: input.amountCents, concept: input.concept, reference: input.reference };
  }
  throw new RangeError('Unknown transfer kind');
}

export type NormalizedTransferIntent = ReturnType<typeof validatedInstruction>;

export function normalizeTransferIntent(input: ResolvedTransferIntent): NormalizedTransferIntent {
  return validatedInstruction(input);
}

/**
 * Explicit field order, versioned JSON, immutable user intent only.
 * Normalized payload amounts are centavos strings; UUIDs are lower-case.
 * The reference intentionally preserves all leading zeros.
 */
export function canonicalTransferPayload(input: ResolvedTransferIntent): string {
  const value = validatedInstruction(input);
  return JSON.stringify({
    v: 1,
    kind: value.kind,
    sourceAccountId: value.sourceAccountId,
    target: value.kind === 'BENEFICIARY'
      ? { beneficiaryId: value.beneficiaryId }
      : { destinationAccountId: value.destinationAccountId },
    amountCents: value.amountCents.toString(),
    concept: value.concept,
    reference: value.reference,
  });
}

export function hashTransferPayload(input: ResolvedTransferIntent): string {
  return createHash('sha256').update(canonicalTransferPayload(input), 'utf8').digest('hex');
}
