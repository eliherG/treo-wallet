import { MobileAuthError } from '../auth/controller';
import type { AuthTransport, MobileAuthReply, MobileCredentials } from '../auth/types';

type Problem = { title?: string; detail?: string; code?: string };

/** The phone needs the Mac LAN address, not 127.0.0.1 (which means the phone). */
export function resolveApiUrl(input?: string): string {
  const url = (input ?? process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+\/api\/v1$/.test(url)) {
    throw new MobileAuthError(0, 'API_URL_MISSING',
      'Configura EXPO_PUBLIC_API_URL con http://IP-DE-TU-MAC:3000/api/v1.');
  }
  if (!__DEV__ && !url.startsWith('https://')) {
    throw new MobileAuthError(0, 'HTTPS_REQUIRED', 'La API de producción requiere HTTPS.');
  }
  return url;
}

async function post<T>(path: string, payload: object): Promise<T> {
  const url = resolveApiUrl();
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new MobileAuthError(0, 'NETWORK_ERROR',
      'No fue posible conectar con la API. Verifica que el iPhone y tu Mac usen la misma red.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = (body && typeof body === 'object') ? body as Problem : {};
    throw new MobileAuthError(response.status, problem.code ?? 'REQUEST_FAILED',
      problem.detail ?? problem.title ?? 'No se pudo completar la solicitud.');
  }
  if (!body || typeof body !== 'object') {
    throw new MobileAuthError(response.status, 'INVALID_RESPONSE', 'Respuesta inválida del servidor.');
  }
  return body as T;
}

export function createAuthTransport(): AuthTransport {
  return {
    login: (input: MobileCredentials) => post<MobileAuthReply>('/auth/login', { ...input, client: 'MOBILE' }),
    refresh: (refreshToken: string) => post<MobileAuthReply>('/auth/refresh', { client: 'MOBILE', refreshToken }),
    logout: async (refreshToken: string) => { await post<{ success: boolean }>('/auth/logout', { client: 'MOBILE', refreshToken }); },
  };
}
