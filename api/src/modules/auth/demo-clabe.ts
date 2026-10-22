import { randomInt } from 'node:crypto';
import { clabeCheckDigit } from '../beneficiaries/clabe.js';

/** Fictitious 999 prefix for demo use only; not a real bank or SPEI account. */
export function generateDemoClabe(): string {
  const first17 = `999${Array.from({ length: 14 }, () => randomInt(0, 10)).join('')}`;
  return `${first17}${clabeCheckDigit(first17)}`;
}
