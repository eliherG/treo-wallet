import { randomInt } from 'node:crypto';

/**
 * CLABE de demostración: prefijo ficticio 999 + 14 dígitos aleatorios
 * + dígito verificador oficial (pesos 3, 7, 1). No es una cuenta SPEI.
 */
export function generateDemoClabe(): string {
  const first17 = `999${Array.from({ length: 14 }, () => randomInt(0, 10)).join('')}`;
  const weights = [3, 7, 1] as const;
  const checksumSum = [...first17].reduce((sum, digit, index) =>
    sum + ((Number(digit) * weights[index % 3]!) % 10), 0);
  return `${first17}${(10 - (checksumSum % 10)) % 10}`;
}
