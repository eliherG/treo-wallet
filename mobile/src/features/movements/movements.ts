import type { components } from '@treo/shared';
import type { AuthorizedGet } from '../../api/authorized-get';

export type Movement = components['schemas']['Movement'];
type MovementsResponse = components['schemas']['MovementsResponse'];
export const RECENT_MOVEMENTS_LIMIT = 20;

/** No cursor, no web-only filters: T-27 requires precisely the latest 20. */
export async function loadRecentMovements(get: AuthorizedGet): Promise<Movement[]> {
  const response = await get<MovementsResponse>(`/movements?limit=${RECENT_MOVEMENTS_LIMIT}`);
  if (!Array.isArray(response.items) || response.items.length > RECENT_MOVEMENTS_LIMIT) {
    throw new Error('Respuesta de movimientos inválida.');
  }
  return response.items;
}

export function movementDateInMexico(instant: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City',
  }).format(new Date(instant));
}
