/** Exact decimal rendering from cents without Number, float or rounding. */
export function formatMxnCents(cents: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(cents)) throw new RangeError('Centavos inválidos.');
  const pesos = cents.length <= 2 ? '0' : cents.slice(0, -2);
  const centavos = cents.slice(-2).padStart(2, '0');
  const grouped = pesos.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${centavos}`;
}

export function formatSignedMxnCents(cents: string): string {
  if (!/^-?(0|[1-9][0-9]*)$/.test(cents)) throw new RangeError('Importe inválido.');
  const isNegative = cents.startsWith('-');
  return `${isNegative ? '−' : '+'}${formatMxnCents(isNegative ? cents.slice(1) : cents)}`;
}
