/**
 * Asserts estáticos. Compilar @treo/shared demuestra que la generación
 * conserva invariantes críticos del contrato sin duplicar interfaces.
 */
import type { components, paths } from './generated/api-types.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

type Assert<T extends true> = T;

export type AccountBalanceIsString = Assert<
  Equal<components['schemas']['Account']['balanceCents'], string>
>;

export type TransferAmountIsString = Assert<
  Equal<components['schemas']['CreateTransferRequest']['amount'], string>
>;

export type TransferIdempotencyParameterExists = Assert<
  Equal<
    paths['/transfers']['post']['parameters']['header']['Idempotency-Key'],
    string
  >
>;

export type MovementCursorNullable = Assert<
  Equal<components['schemas']['MovementsResponse']['nextCursor'], string | null>
>;

export type AccountCurrencyIsMxn = Assert<
  Equal<components['schemas']['Account']['currency'], 'MXN'>
>;
