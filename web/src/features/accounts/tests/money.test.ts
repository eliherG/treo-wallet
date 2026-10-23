import { describe, expect, it } from 'vitest';
import { formatMxnCents } from '../money';

describe('T-22 MXN exacto', () => {
  it('conserva centavos, cero y grandes enteros sin IEEE-754', () => {
    expect(formatMxnCents('0')).toMatch(/0[.,]00/);
    expect(formatMxnCents('15025')).toMatch(/150[.,]25/);
    const large = formatMxnCents('9223372036854775807');
    expect(large).toContain('07');
    expect(large).toContain('92');
  });
  it('rechaza importes malformados', () => {
    expect(() => formatMxnCents('1.2')).toThrow();
    expect(() => formatMxnCents('-4')).toThrow();
  });
});
