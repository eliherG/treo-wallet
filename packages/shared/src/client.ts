import createClient from 'openapi-fetch';
import type { paths } from './generated/api-types.js';

/**
 * Adaptador HTTP tipado para web, móvil o Node.js.
 * No contiene credenciales ni gestiona tokens: cada consumidor configura
 * autorización, manejo de errores y recuperación de red en su propia capa.
 */
export function createTreoApiClient(baseUrl: string) {
  if (!baseUrl) {
    throw new Error('La URL base de la API es obligatoria');
  }
  return createClient<paths>({ baseUrl });
}

export type TreoApiClient = ReturnType<typeof createTreoApiClient>;
