import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './SessionProvider';
import { PageFrame } from './PageFrame';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { BeneficiariesPage } from '../features/beneficiaries/BeneficiariesPage';
import { TransferFlowProvider } from '../features/transfers/TransferFlow';
import { TransferNewPage } from '../features/transfers/TransferNewPage';
import { TransferReviewPage } from '../features/transfers/TransferReviewPage';
import { TransferOtpPage } from '../features/transfers/TransferOtpPage';
import { TransferStatusPage } from '../features/transfers/TransferStatusPage';

function Protected({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready) return <p role="status" className="page-loading">Comprobando tu sesión…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <PageFrame>{children}</PageFrame>;
}

function AuthenticatedRoutes() {
  const { user } = useSession();
  return <TransferFlowProvider key={user?.id ?? "anonymous"}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/dashboard" element={<Protected><AccountsPage /></Protected>} />
    <Route path="/beneficiaries" element={<Protected><BeneficiariesPage /></Protected>} />
    <Route path="/transfer/new" element={<Protected><TransferNewPage /></Protected>} />
    <Route path="/transfer/review" element={<Protected><TransferReviewPage /></Protected>} />
    <Route path="/transfer/otp" element={<Protected><TransferOtpPage /></Protected>} />
    <Route path="/transfer/:id" element={<Protected><TransferStatusPage /></Protected>} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></TransferFlowProvider>;
}

export function App() {
  return <SessionProvider><AuthenticatedRoutes /></SessionProvider>;
}
