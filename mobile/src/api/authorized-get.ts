import { MobileAuthController, MobileAuthError } from '../auth/controller';
import { resolveApiUrl } from './auth-api';

type Problem = { title?: string; detail?: string; code?: string };
export type AuthorizedGet = <T>(path: string) => Promise<T>;

/** Uses the access JWT only in memory; one shared refresh rotation on 401. */
export function createAuthorizedGet(
  controller: MobileAuthController,
  onSessionExpired: () => void,
  apiBaseUrl?: string,
  fetcher: typeof fetch = fetch,
): AuthorizedGet {
  const baseUrl = apiBaseUrl ?? resolveApiUrl();
  return async <T>(path: string): Promise<T> => {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new MobileAuthError(0, 'INVALID_PATH', 'Ruta de API inválida.');
    }
    let token = controller.access;
    if (!token) {
      const restored = await controller.renew();
      if (!restored) {
        onSessionExpired();
        throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
      }
      token = controller.access;
    }

    async function send(access: string | null): Promise<Response> {
      if (!access) throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
      try {
        return await fetcher(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${access}`, Accept: 'application/json' },
        });
      } catch {
        throw new MobileAuthError(0, 'NETWORK_ERROR', 'No fue posible conectar con la API.');
      }
    }

    let reply = await send(token);
    if (reply.status === 401) {
      // Another simultaneous GET may already have rotated our access token.
      if (!controller.access || controller.access === token) {
        const renewed = await controller.renew();
        if (!renewed) {
          onSessionExpired();
          throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
        }
      }
      reply = await send(controller.access); // exactly one retry
    }

    const data: unknown = await reply.json().catch(() => null);
    if (!reply.ok) {
      const problem: Problem = data !== null && typeof data === 'object' ? data as Problem : {};
      throw new MobileAuthError(reply.status, problem.code ?? 'REQUEST_FAILED',
        problem.detail ?? problem.title ?? 'No fue posible consultar la información.');
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new MobileAuthError(reply.status, 'INVALID_RESPONSE', 'La API devolvió una respuesta inválida.');
    }
    return data as T;
  };
}
