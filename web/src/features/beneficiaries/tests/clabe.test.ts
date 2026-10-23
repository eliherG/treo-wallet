import { describe, expect, it } from 'vitest';
import { isValidClabe } from '../clabe';

describe('T-22 CLABE', () => {
  it('acepta checksum conocido y rechaza errores de longitud y control', () => {
    const valid = '032180000118359719'; // Example checksum verified by the DOF sequence.
    expect(isValidClabe(valid)).toBe(true);
    expect(isValidClabe(valid.slice(0, 17))).toBe(false);
    expect(isValidClabe(valid.slice(0, 17) + (valid[17] === '0' ? '1' : '0'))).toBe(false);
  });
});
