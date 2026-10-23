export interface ProblemDetail { title?: string; detail?: string; status?: number; code?: string; requestId?: string }

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Same-origin /api/v1 is proxied by Vite locally; cookies remain HttpOnly. */
export async function apiFetch<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No fue posible conectar con el servidor.');
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { if (response.ok) throw new ApiError(response.status, 'INVALID_RESPONSE', 'Respuesta inválida del servidor.'); }
  if (!response.ok) {
    const issue = (data && typeof data === 'object') ? data as ProblemDetail : {};
    throw new ApiError(response.status, typeof issue.code === 'string' ? issue.code : 'REQUEST_FAILED',
      issue.detail || issue.title || 'No se pudo completar la solicitud.', issue.requestId);
  }
  return data as T;
}
