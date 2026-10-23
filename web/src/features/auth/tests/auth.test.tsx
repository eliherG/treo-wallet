import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../../../app/App';

function renderAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></QueryClientProvider>);
}
function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => json({ code: 'INVALID_SESSION', detail: 'Sesión inválida' }, 401))); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('T-21 autenticación web', () => {
  it('muestra errores accesibles antes de enviar login inválido', async () => {
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: /entrar a treo/i }));
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
  });
  it('inicia sesión WEB sin solicitar ni guardar refresh en JavaScript', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      // T-22 loads /accounts immediately after login; this request must have
      // a successful mock, otherwise a simulated 401 logs the user out.
      if (String(_url).endsWith('/accounts')) return json({ accounts: [] });
      const payload = init?.body ? JSON.parse(String(init.body)) as { client?: string } : {};
      if (payload.client === 'WEB' && String(_url).endsWith('/auth/login')) return json({
        accessToken: 'short.jwt', accessExpiresInSeconds: 900,
        user: { id: '11111111-1111-4111-8111-111111111111', name: 'Usuaria Demo', email: 'demo@treo.test' },
      });
      return json({ code: 'INVALID_SESSION' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/correo electrónico/i), 'demo@treo.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'password-123456');
    await userEvent.click(screen.getByRole('button', { name: /entrar a treo/i }));
    // T-22 replaced the temporary "Tu sesión está activa" placeholder.
    expect(await screen.findByRole('heading', { name: /resumen de cuentas/i })).toBeInTheDocument();
    expect(await screen.findByText(/todavía no tienes cuentas asociadas/i)).toBeInTheDocument();
    const login = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'));
    expect(login).toBeTruthy();
    expect((login?.[1] as RequestInit).credentials).toBe('include');
    expect(JSON.parse(String((login?.[1] as RequestInit).body))).toMatchObject({ client: 'WEB' });
    expect(await screen.findByText(/Usuaria Demo/)).toBeInTheDocument();
    const accounts = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/accounts'));
    expect(accounts).toBeTruthy();
    expect(new Headers((accounts?.[1] as RequestInit).headers).get('Authorization')).toBe('Bearer short.jwt');
  });

  it('registra un perfil WEB y muestra confirmación antes de login', async () => {
    const fetchMock = vi.fn(async (url: unknown) => String(url).endsWith('/auth/register')
      ? json({ user: { id: 'c0ac1d1d-0cee-4aaf-8aa1-000000000001', name: 'Nombre Test', email: 'persona@treo.test' } }, 201)
      : json({ code: 'INVALID_SESSION' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/register');
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Nombre Test');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'persona@treo.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'segura-de-prueba-12345');
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText(/Cuenta creada. Ahora inicia sesión/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/register'))).toBe(true);
  });
  it('muestra error controlado de credenciales', async () => {
    const fetchMock = vi.fn(async (url: unknown) => String(url).endsWith('/auth/login')
      ? json({ code: 'INVALID_CREDENTIALS', detail: 'Las credenciales son incorrectas.' }, 401)
      : json({code: 'INVALID_SESSION'}, 401));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'persona@treo.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave-equivoada');
    await userEvent.click(screen.getByRole('button', { name: /entrar a treo/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Las credenciales son incorrectas.');
  });
  it('valida registro antes de llamar la API', async () => {
    renderAt('/register');
    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByText(/al menos dos caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/al menos 12 caracteres/i)).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1)); // refresh only
  });
});
