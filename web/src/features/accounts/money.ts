/** Format arbitrarily large exact centavo strings without IEEE-754 conversion. */
const pesoParts = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).formatToParts(0);
const group = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

export function formatMxnCents(cents: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(cents)) throw new RangeError('Centavos inválidos');
  const amount = BigInt(cents);
  const integer = group.format(amount / 100n);
  const fraction = String(amount % 100n).padStart(2, '0');
  return pesoParts.map(part => {
    if (part.type === 'integer') return integer;
    if (part.type === 'fraction') return fraction;
    return part.value;
  }).join('');
}
