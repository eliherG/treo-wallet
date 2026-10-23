import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { components } from '@treo/shared';
import { apiFetch, ApiError } from '../api/http';

type AuthResponse = components['schemas']['AuthResponse'];
type User = components['schemas']['User'];
type RegisterRequest = components['schemas']['RegisterRequest'];

type Session = {
  user: User | null; ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: RegisterRequest): Promise<void>;
  logout(): Promise<void>;
  authorizedFetch<T>(path: string, init?: RequestInit): Promise<T>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const access = useRef<string | null>(null);
  const refreshPromise = useRef<Promise<AuthResponse | null> | null>(null);

  const forget = useCallback(() => { access.current = null; setUser(null); cache.clear(); }, [cache]);
  const remember = useCallback((reply: AuthResponse) => {
    access.current = reply.accessToken;
    setUser(reply.user);
  }, []);

  const refresh = useCallback((): Promise<AuthResponse | null> => {
    if (refreshPromise.current) return refreshPromise.current;
    const pending = apiFetch<AuthResponse>('/auth/refresh', {
      method: 'POST', body: JSON.stringify({ client: 'WEB' }),
    }).then(reply => { remember(reply); return reply; })
      .catch(error => {
        // A network outage is not proof of logout; do not expose private data after refresh failure.
        if (error instanceof ApiError && error.status === 401) forget();
        return null;
      }).finally(() => { refreshPromise.current = null; });
    refreshPromise.current = pending;
    return pending;
  }, [remember, forget]);

  useEffect(() => {
    let active = true;
    void refresh().finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const reply = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password, client: 'WEB' }),
    });
    cache.clear(); remember(reply);
  }, [cache, remember]);

  const register = useCallback(async (input: RegisterRequest) => {
    await apiFetch<components['schemas']['RegisterResponse']>('/auth/register', {
      method: 'POST', body: JSON.stringify(input),
    });
  }, []);

  const logout = useCallback(async () => {
    // Only clear the session after the server acknowledges refresh revocation.
    await apiFetch<{ success: true }>('/auth/logout', {
      method: 'POST', body: JSON.stringify({ client: 'WEB' }),
    });
    forget();
  }, [forget]);

  const authorizedFetch = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    let token = access.current;
    if (!token) token = (await refresh())?.accessToken ?? null;
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
    try { return await apiFetch<T>(path, init, token); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await refresh();
      if (!renewed) throw error;
      return apiFetch<T>(path, init, renewed.accessToken);
    }
  }, [refresh]);

  const context = useMemo<Session>(() => ({ user, ready, login, register, logout, authorizedFetch }),
    [user, ready, login, register, logout, authorizedFetch]);
  return <SessionContext.Provider value={context}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession requiere SessionProvider');
  return session;
}
