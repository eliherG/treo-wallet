import { MobileAuthController, MobileAuthError } from '../auth/controller';
import { resolveApiUrl } from './auth-api';

export type AuthorizedPost = <T>(path: string, payload: object, idempotencyKey?: string) => Promise<T>;
type Problem = { title?: string; detail?: string; code?: string };

/** POST refreshes access tokens only after an explicit 401; never retries an uncertain write. */
export function createAuthorizedPost(
  controller: MobileAuthController,
  onSessionExpired: () => void,
  apiBaseUrl?: string,
  fetcher: typeof fetch = fetch,
): AuthorizedPost {
  const base = apiBaseUrl ?? resolveApiUrl();
  return async <T>(path: string, payload: object, idempotencyKey?: string): Promise<T> => {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
      throw new MobileAuthError(0, 'INVALID_PATH', 'Ruta de API inválida.');
    }
    if (path === '/transfers' && (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
      throw new MobileAuthError(0, 'INVALID_KEY', 'Falta la llave idempotente.');
    }
    let access = controller.access;
    if (!access) {
      const renewed = await controller.renew();
      if (!renewed) {
        onSessionExpired();
        throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
      }
      access = controller.access;
    }
    const body = JSON.stringify(payload);
    async function send(token: string | null): Promise<Response> {
      if (!token) throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
      const abort = new AbortController();
      const deadline = setTimeout(() => abort.abort(), 15_000);
      try {
        return await fetcher(`${base}${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body,
          signal: abort.signal,
        });
      } catch {
        // Timeout may happen AFTER the server commits: never auto-retry a write here.
        throw new MobileAuthError(0, 'NETWORK_ERROR', 'Tiempo agotado o red interrumpida: resultado no confirmado.');
      } finally {
        clearTimeout(deadline);
      }
    }
    let response = await send(access);
    if (response.status === 401) {
      // A 401 is an explicit rejected request; only then is one token-refresh retry safe.
      if (!controller.access || controller.access === access) {
        const renewed = await controller.renew();
        if (!renewed) {
          onSessionExpired();
          throw new MobileAuthError(401, 'SESSION_EXPIRED', 'Tu sesión ha expirado.');
        }
      }
      response = await send(controller.access);
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = data && typeof data === 'object' ? data as Problem : {};
      throw new MobileAuthError(response.status, problem.code ?? 'REQUEST_FAILED',
        problem.detail ?? problem.title ?? 'No fue posible completar la operación.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new MobileAuthError(response.status, 'INVALID_RESPONSE', 'Respuesta incompleta después de la operación.');
    }
    return data as T;
  };
}
