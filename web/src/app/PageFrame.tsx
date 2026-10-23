import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSession } from './SessionProvider';

export function PageFrame({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const signOut = async () => {
    setBusy(true); setMessage('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch { setMessage('No se pudo cerrar la sesión. Intenta nuevamente.'); }
    finally { setBusy(false); }
  };
  return <div className="app-shell">
    <aside className="side-nav" aria-label="Navegación principal">
      <div className="brand brand-light"><span className="brand-mark">T</span><span>TREO <small>WALLET</small></span></div>
      <span className="nav-caption">ESPACIO PERSONAL</span>
      <nav aria-label="Secciones"><NavLink to="/dashboard">Resumen de cuentas</NavLink><NavLink to="/beneficiaries">Beneficiarios</NavLink></nav>
      <div className="nav-bottom"><p>Cuenta segura</p><small>Operaciones en pesos mexicanos</small></div>
    </aside>
    <div className="main-layout">
      <header className="topbar"><span>Bienvenido, <strong>{user?.name}</strong></span><button type="button" className="btn-quiet" onClick={() => void signOut()} disabled={busy}>Cerrar sesión</button></header>
      {message && <p role="alert" className="banner-error">{message}</p>}
      <main>{children}</main>
    </div>
  </div>;
}
