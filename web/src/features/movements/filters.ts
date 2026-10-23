import { formatMxnCents } from '../accounts/money';

export type MovementFilters = {
  accountId: string;
  type: '' | 'DEBIT' | 'CREDIT';
  from: string;
  to: string;
};

export const emptyMovementFilters: MovementFilters = { accountId: '', type: '', from: '', to: '' };
export const MOVEMENTS_PAGE_SIZE = 20;

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function movementFilterError(filters: MovementFilters): string | null {
  if (filters.from && !validDate(filters.from)) return 'La fecha inicial no es válida.';
  if (filters.to && !validDate(filters.to)) return 'La fecha final no es válida.';
  if (filters.from && filters.to && filters.from > filters.to) return 'La fecha inicial no puede superar la fecha final.';
  return null;
}

/** A cursor is only valid for exactly these filters AND this limit. */
export function buildMovementsPath(filters: MovementFilters, cursor: string | null): string {
  const params = new URLSearchParams();
  params.set('limit', String(MOVEMENTS_PAGE_SIZE));
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.type) params.set('type', filters.type);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (cursor) params.set('cursor', cursor);
  return `/movements?${params.toString()}`;
}

/** Debit/credit sign is derived from signedAmountCents, without floating point. */
export function formatSignedMovementCents(cents: string): string {
  if (!/^-?(0|[1-9][0-9]*)$/.test(cents)) throw new RangeError('Importe de movimiento inválido');
  const negative = cents.startsWith('-');
  const absolute = negative ? cents.slice(1) : cents;
  return `${negative ? '−' : '+'}${formatMxnCents(absolute)}`;
}

export function movementDateInMexico(instant: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City',
  }).format(new Date(instant));
}
