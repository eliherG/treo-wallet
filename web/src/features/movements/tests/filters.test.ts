import { describe, expect, it } from 'vitest';
import {
  buildMovementsPath, emptyMovementFilters, formatSignedMovementCents,
  movementFilterError, MOVEMENTS_PAGE_SIZE,
} from '../filters';

describe('T-24 filtros y precisión del historial', () => {
  it('genera query de filtros y cursor opaco sin alterarlo', () => {
    const filters = { accountId: 'account-1', type: 'DEBIT' as const, from: '2026-01-10', to: '2026-01-15' };
    const cursor = 'eyJ0ZXN0IjoiYS9iK2M9In0=';
    const url = new URL(buildMovementsPath(filters, cursor), 'http://localhost');
    expect(url.pathname).toBe('/movements');
    expect(url.searchParams.get('limit')).toBe(String(MOVEMENTS_PAGE_SIZE));
    expect(url.searchParams.get('cursor')).toBe(cursor);
    expect(url.searchParams.get('accountId')).toBe(filters.accountId);
    expect(url.searchParams.get('type')).toBe('DEBIT');
    expect(url.searchParams.get('from')).toBe(filters.from);
    expect(url.searchParams.get('to')).toBe(filters.to);
  });
  it('sin filtro no envía ni reusa cursor', () => {
    const url = new URL(buildMovementsPath(emptyMovementFilters, null), 'http://localhost');
    expect(url.searchParams.get('cursor')).toBeNull();
    expect(url.searchParams.get('accountId')).toBeNull();
    expect(url.searchParams.get('type')).toBeNull();
  });
  it('rechaza rangos invertidos y fechas imposibles', () => {
    expect(movementFilterError({ ...emptyMovementFilters, from: '2026-10-24', to: '2026-10-23' })).toMatch(/inicial/);
    expect(movementFilterError({ ...emptyMovementFilters, from: '2026-02-30' })).toMatch(/no es válida/);
    expect(movementFilterError({ ...emptyMovementFilters, from: '2026-02-28', to: '2026-03-01' })).toBeNull();
  });
  it('formatea cargos y abonos con BigInt, incluso importes superiores a Number.MAX_SAFE_INTEGER', () => {
    expect(formatSignedMovementCents('-125')).toMatch(/−.*1[.,]25/);
    expect(formatSignedMovementCents('125')).toMatch(/\+.*1[.,]25/);
    expect(formatSignedMovementCents('900719925474099300')).toContain('9,007,199,254,740,993.00');
    expect(() => formatSignedMovementCents('100.99')).toThrow();
  });
});
