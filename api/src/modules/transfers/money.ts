/** PostgreSQL signed BIGINT bounds, expressed without floating-point conversion. */
export const PG_BIGINT_MIN = -9223372036854775808n;
export const PG_BIGINT_MAX = 9223372036854775807n;

const MXN_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;
// The largest admissible input is 92233720368547758.07 (20 characters).
const MAX_MXN_LENGTH = 20;

/** Positive transfer input in MXN -> exact cents. No coercion, trim or rounding. */
export function parseMxnToCents(value: string): bigint {
  if (typeof value !== 'string') throw new TypeError('El importe debe ser una cadena decimal.');
  if (value.length > MAX_MXN_LENGTH) throw new RangeError('Importe fuera del rango permitido.');
  const match = MXN_DECIMAL.exec(value);
  // JS $ also matches before a final newline; require consumption of the whole input.
  if (!match || match[0] !== value) throw new RangeError('Formato de importe inválido.');

  const cents = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (cents <= 0n || cents > PG_BIGINT_MAX) {
    throw new RangeError('Importe fuera del rango permitido.');
  }
  return cents;
}

/** Generic DB/JSON boundary: zero balances and negative ledger entries are valid. */
export function serializeCents(value: bigint): string {
  if (typeof value !== 'bigint') throw new TypeError('Los centavos deben ser bigint.');
  if (value < PG_BIGINT_MIN || value > PG_BIGINT_MAX) {
    throw new RangeError('Centavos fuera del rango BIGINT.');
  }
  return value.toString();
}

/** Exact decimal MXN representation; JSON API monetary fields still use cents. */
export function centsToMxn(value: bigint): string {
  serializeCents(value); // Validate type and signed BIGINT bounds before arithmetic.
  const absolute = value < 0n ? -value : value;
  const pesos = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${value < 0n ? '-' : ''}${pesos.toString()}.${fraction}`;
}
