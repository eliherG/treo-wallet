import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './SessionProvider';
import { PageFrame } from './PageFrame';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready) return <p role="status" className="page-loading">Comprobando tu sesión…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <PageFrame>{children}</PageFrame>;
}

export function App() {
  return <SessionProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/dashboard" element={<Protected><section className="content"><h1>Resumen</h1><p>Tu sesión está activa. Las cuentas se habilitarán en T-22.</p></section></Protected>} />
    <Route path="/beneficiaries" element={<Protected><section className="content"><h1>Beneficiarios</h1><p>Disponibles a partir de T-22.</p></section></Protected>} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></SessionProvider>;
}
