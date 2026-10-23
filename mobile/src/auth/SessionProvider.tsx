import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MobileAuthController } from './controller';
import type { MobileCredentials, MobileUser } from './types';
import { secureTokenStorage } from './secure-store';
import { createAuthTransport } from '../api/auth-api';

type Session = {
  user: MobileUser | null;
  ready: boolean;
  login(input: MobileCredentials): Promise<void>;
  logout(): Promise<void>;
};

const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const controller = useMemo(() => new MobileAuthController(secureTokenStorage, createAuthTransport()), []);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let current = true;
    void controller.restore()
      .then(next => { if (current) setUser(next); })
      .catch(() => { if (current) setUser(null); })
      .finally(() => { if (current) setReady(true); });
    return () => { current = false; };
  }, [controller]);

  const value: Session = {
    user, ready,
    login: async input => { const next = await controller.login(input); setUser(next); },
    logout: async () => { await controller.logout(); setUser(null); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useSession debe utilizarse dentro de SessionProvider');
  return ctx;
}
