import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './SessionProvider';
import { PageFrame } from './PageFrame';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { BeneficiariesPage } from '../features/beneficiaries/BeneficiariesPage';

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
    <Route path="/dashboard" element={<Protected><AccountsPage /></Protected>} />
    <Route path="/beneficiaries" element={<Protected><BeneficiariesPage /></Protected>} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></SessionProvider>;
}
