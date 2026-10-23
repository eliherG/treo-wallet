import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useSession } from '../../app/SessionProvider';
import { ApiError } from '../../api/http';

const schema = z.object({ email: z.string().trim().email('Escribe un correo válido.'), password: z.string().min(1, 'Ingresa tu contraseña.') });

export function LoginPage() {
  const { user, ready, login } = useSession();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  if (ready && user) return <Navigate to="/dashboard" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(''); setErrors({});
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]))); return; }
    setBusy(true);
    try { await login(parsed.data.email, parsed.data.password); navigate('/dashboard', { replace: true }); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  };
  return <main className="auth-layout"><section className="auth-hero"><div className="brand"><span className="brand-mark">T</span>TREO <small>WALLET</small></div><div><p className="eyebrow">TU DINERO, TU CONTROL</p><h1>Tu mundo financiero, más simple.</h1><p>Una experiencia clara para consultar y administrar tus cuentas.</p></div><span className="hero-foot">Billetera de demostración · MXN</span></section>
    <section className="auth-panel"><div className="auth-card"><p className="eyebrow">BIENVENIDO DE NUEVO</p><h2>Inicia sesión</h2><p className="muted">Accede con tus credenciales para continuar.</p>
      {params.get('registered') === '1' && <p role="status" className="notice">Cuenta creada. Ahora inicia sesión.</p>}
      <form onSubmit={event => void submit(event)} noValidate>
        <label htmlFor="login-email">Correo electrónico</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined}/>{errors.email && <span id="login-email-error" role="alert" className="field-error">{errors.email}</span>}
        <label htmlFor="login-password">Contraseña</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined}/>{errors.password && <span id="login-password-error" role="alert" className="field-error">{errors.password}</span>}
        {message && <p role="alert" className="banner-error">{message}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Validando…' : 'Entrar a Treo'}</button>
      </form><p className="form-footer">¿Todavía no tienes cuenta? <Link to="/register">Regístrate</Link></p>
    </div></section>
  </main>;
}
