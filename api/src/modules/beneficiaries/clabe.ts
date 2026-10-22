/**
 * CLABE (Mexico): 17 digits plus a modulo-10 check digit.
 * Weight sequence 3, 7, 1 is applied to the first 17 digits.
 * Reference: DOF, Circular 12/2018, Annex 4.
 * A valid checksum does not establish that an account exists or is transferable.
 */
const FIRST_17 = /^[0-9]{17}$/;
const FULL_CLABE = /^[0-9]{18}$/;
const WEIGHTS = [3, 7, 1] as const;

export function clabeCheckDigit(first17: string): string {
  if (!FIRST_17.test(first17)) {
    throw new RangeError('CLABE prefix must have exactly 17 numeric digits');
  }
  let sum = 0;
  for (let index = 0; index < 17; index++) {
    sum += ((first17.charCodeAt(index) - 48) * WEIGHTS[index % 3]!) % 10;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidClabe(value: unknown): value is string {
  return typeof value === 'string' && FULL_CLABE.test(value)
    && value[17] === clabeCheckDigit(value.slice(0, 17));
}

/** Masking is a presentation rule; the full CLABE must never enter the API response. */
export function maskClabe(clabe: string): string {
  if (!FULL_CLABE.test(clabe)) throw new Error('Invalid stored CLABE format');
  return `${'*'.repeat(14)}${clabe.slice(-4)}`;
}
