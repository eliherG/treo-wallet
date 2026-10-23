import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useSession } from '../../app/SessionProvider';
import { ApiError } from '../../api/http';

const schema = z.object({
  name: z.string().trim().min(2, 'Ingresa al menos dos caracteres.').max(100),
  email: z.string().trim().email('Escribe un correo válido.'),
  password: z.string().min(12, 'La contraseña requiere al menos 12 caracteres.').max(128),
});
export function RegisterPage() {
  const { register } = useSession(); const navigate = useNavigate();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage(''); setErrors({});
    const parsed = schema.safeParse({ name, email, password });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]))); return; }
    setBusy(true);
    try { await register(parsed.data); navigate('/login?registered=1', { replace: true }); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'No se pudo crear la cuenta.'); }
    finally { setBusy(false); }
  };
  return <main className="auth-layout"><section className="auth-hero"><div className="brand"><span className="brand-mark">T</span>TREO <small>WALLET</small></div><div><p className="eyebrow">COMIENZA AQUÍ</p><h1>Empieza con una cuenta que se siente tuya.</h1><p>Registro seguro. Una nueva cuenta de demostración inicia con saldo $0.00.</p></div><span className="hero-foot">Billetera de demostración · MXN</span></section>
    <section className="auth-panel"><div className="auth-card"><p className="eyebrow">ABRE TU CUENTA</p><h2>Crear perfil</h2><p className="muted">Solo necesitamos algunos datos para comenzar.</p>
      <form onSubmit={event => void submit(event)} noValidate>
        <label htmlFor="register-name">Nombre completo</label><input id="register-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} aria-invalid={!!errors.name}/>{errors.name && <span role="alert" className="field-error">{errors.name}</span>}
        <label htmlFor="register-email">Correo electrónico</label><input id="register-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email}/>{errors.email && <span role="alert" className="field-error">{errors.email}</span>}
        <label htmlFor="register-password">Contraseña</label><input id="register-password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!errors.password}/><small className="muted">Mínimo 12 caracteres.</small>{errors.password && <span role="alert" className="field-error">{errors.password}</span>}
        {message && <p role="alert" className="banner-error">{message}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
      </form><p className="form-footer">¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></p>
    </div></section>
  </main>;
}
