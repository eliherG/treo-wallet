import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../api/http';
import { App } from '../app/App';
import { formatMxnCents } from '../features/accounts/money';

// The real App/Routes/React Query/components execute together. Only the HTTP
// boundary and authenticated session are replaced by predictable test doubles.
const api = vi.hoisted(() => ({ fetch: vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>() }));
vi.mock('../app/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Demo T25' },
    ready: true,
    authorizedFetch: api.fetch,
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

const source = '11111111-1111-4111-8111-111111111111';
const destination = '22222222-2222-4222-8222-222222222222';
const transferId = '33333333-3333-4333-8333-333333333333';
const movementId = '44444444-4444-4444-8444-444444444444';
const accounts = (completed = false) => ({ accounts: [
  { id: source, clabeMasked: '**************0012', currency: 'MXN', status: 'ACTIVE', balanceCents: completed ? '899875' : '900000' },
  { id: destination, clabeMasked: '**************0025', currency: 'MXN', status: 'ACTIVE', balanceCents: completed ? '125' : '0' },
] });
function result(status: 'COMPLETED' | 'PENDING_CONFIRMATION' | 'REJECTED' | 'PROCESSING', cents = '125') {
  return { transfer: {
    id: transferId, status, kind: 'OWN_ACCOUNTS', sourceAccountId: source,
    destinationAccountMasked: '**************0025', amountCents: cents,
    concept: 'T25 integración', reference: '0025', requiresOtp: status === 'PENDING_CONFIRMATION',
    createdAt: '2026-10-23T12:00:00.000Z', completedAt: status === 'COMPLETED' ? '2026-10-23T12:00:01.000Z' : null,
    rejectionCode: status === 'REJECTED' ? 'INSUFFICIENT_FUNDS' : null,
  } };
}
const movements = { items: [{
  id: movementId, transferId, accountId: source, type: 'DEBIT',
  signedAmountCents: '-125', concept: 'T25 integración', reference: '0025',
  createdAt: '2026-10-23T12:00:01.000Z',
}], nextCursor: null };

function mount(route = '/transfer/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[route]}><App /></MemoryRouter>
  </QueryClientProvider>);
}
async function reviewTransfer(amount = '1.25') {
  const user = userEvent.setup();
  const accountInput = screen.getByLabelText('Cuenta de origen');
  await within(accountInput).findByRole('option', { name: /0012/ });
  await user.selectOptions(accountInput, source);
  await user.selectOptions(screen.getByLabelText('Cuenta destino propia'), destination);
  await user.type(screen.getByLabelText('Monto (MXN)'), amount);
  await user.type(screen.getByLabelText('Concepto'), 'T25 integración');
  await user.type(screen.getByLabelText(/Referencia numérica/i), '0025');
  await user.click(screen.getByRole('button', { name: 'Revisar transferencia' }));
  expect(await screen.findByRole('heading', { name: 'Revisa tu transferencia' })).toBeInTheDocument();
  return user;
}
function calls(path: string) { return api.fetch.mock.calls.filter(([item]) => item === path); }

beforeEach(() => {
  api.fetch.mockReset();
  api.fetch.mockImplementation(async (path) => {
    if (path === '/accounts') return accounts();
    if (path === '/beneficiaries') return { beneficiaries: [] };
    if (path.startsWith('/movements?')) return movements;
    if (path === `/transfers/${transferId}`) return result('COMPLETED');
    throw new Error(`T25: no mock configured for ${path}`);
  });
});
afterEach(() => vi.clearAllMocks());

describe('T-25 recorrido integrado y accesibilidad web', () => {
  it('en formulario inválido enfoca el primer campo y relaciona su error accesible', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Nueva transferencia' });
    await within(screen.getByLabelText('Cuenta de origen')).findByRole('option', { name: /0012/ });
    await userEvent.click(screen.getByRole('button', { name: 'Revisar transferencia' }));
    const sourceInput = screen.getByLabelText('Cuenta de origen');
    expect(sourceInput).toHaveFocus();
    expect(sourceInput).toHaveAttribute('aria-invalid', 'true');
    const errorId = sourceInput.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Selecciona una cuenta de origen activa.');
    expect(calls('/transfers')).toHaveLength(0);
  });

  it('muestra revisión explícita con monto exacto y no envía dinero antes de confirmar', async () => {
    mount();
    await reviewTransfer('1.25');
    expect(screen.getByText(formatMxnCents('125'))).toBeInTheDocument();
    expect(screen.getByText('T25 integración')).toBeInTheDocument();
    expect(screen.getByText('0025')).toBeInTheDocument();
    expect(calls('/transfers')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Confirmar transferencia' })).toBeEnabled();
  });

  it('HTTP 422 INSUFFICIENT_FUNDS: error enfocado, sin comprobante ni doble cargo', async () => {
    api.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts();
      if (path === '/transfers') throw new ApiError(422, 'INSUFFICIENT_FUNDS', 'Fondos insuficientes.');
      throw new Error(path);
    });
    mount(); const user = await reviewTransfer('1.25');
    await user.click(screen.getByRole('button', { name: 'Confirmar transferencia' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('INSUFFICIENT_FUNDS');
    expect(alert).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Revisa tu transferencia' })).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    expect(calls('/transfers')).toHaveLength(1);
  });

  it('doble clic produce un POST; COMPLETED lleva a comprobante, actualiza saldo e historial', async () => {
    let settle!: (value: unknown) => void;
    const pending = new Promise<unknown>(resolve => { settle = resolve; });
    let completed = false;
    api.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts(completed);
      if (path === '/transfers') return pending;
      if (path === `/transfers/${transferId}`) return result('COMPLETED');
      if (path.startsWith('/movements?')) return movements;
      throw new Error(path);
    });
    mount('/dashboard');
    expect(await screen.findByText(formatMxnCents('900000'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Transferir' }));
    await reviewTransfer();
    const button = screen.getByRole('button', { name: 'Confirmar transferencia' });
    fireEvent.click(button); fireEvent.click(button);
    expect(calls('/transfers')).toHaveLength(1);
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    completed = true;
    settle(result('COMPLETED'));
    expect(await screen.findByRole('heading', { name: 'Comprobante de transferencia' })).toBeInTheDocument();
    expect(calls(`/transfers/${transferId}`).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('link', { name: 'Resumen de cuentas' }));
    expect(await screen.findByText(formatMxnCents('899875'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Movimientos' }));
    expect(await screen.findByText('T25 integración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver transferencia' })).toHaveAttribute('href', `/transfer/${transferId}`);
  });

  it('error de red permite recuperar la misma intención sin cambiar la llave', async () => {
    let attempts = 0;
    api.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts();
      if (path === '/transfers') { attempts++; if (attempts === 1) throw new ApiError(0, 'NETWORK_ERROR', 'Sin conexión.'); return result('COMPLETED'); }
      if (path === `/transfers/${transferId}`) return result('COMPLETED');
      throw new Error(path);
    });
    mount(); const user = await reviewTransfer();
    await user.click(screen.getByRole('button', { name: 'Confirmar transferencia' }));
    expect(await screen.findByText(/se conserva la misma llave de idempotencia/i)).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar misma intención' }));
    expect(await screen.findByRole('heading', { name: 'Comprobante de transferencia' })).toBeInTheDocument();
    const attemptsToTransfer = calls('/transfers');
    expect(attemptsToTransfer).toHaveLength(2);
    const first = (attemptsToTransfer[0]![1]!.headers as Record<string,string>)['Idempotency-Key'];
    const second = (attemptsToTransfer[1]![1]!.headers as Record<string,string>)['Idempotency-Key'];
    expect(second).toBe(first);
  });

  it('OTP pendiente, error de seis dígitos, rechazo y éxito no confunden comprobante', async () => {
    let confirmed = false;
    let attempts = 0;
    api.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts();
      if (path === '/transfers') return result('PENDING_CONFIRMATION', '500001');
      if (path === `/transfers/${transferId}`) return result(confirmed ? 'COMPLETED' : 'PENDING_CONFIRMATION', '500001');
      if (path === `/transfers/${transferId}/confirm`) {
        attempts++;
        if (attempts === 1) throw new ApiError(422, 'OTP_INVALID', 'Código inválido.');
        confirmed = true;
        return result('COMPLETED', '500001');
      }
      throw new Error(path);
    });
    mount(); const user = await reviewTransfer('5000.01');
    await user.click(screen.getByRole('button', { name: 'Confirmar transferencia' }));
    expect(await screen.findByRole('heading', { name: 'Confirmación OTP' })).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    const otp = screen.getByLabelText('Código OTP de 6 dígitos');
    await user.type(otp, '12');
    await user.click(screen.getByRole('button', { name: 'Confirmar OTP' }));
    expect(otp).toHaveFocus();
    expect(otp).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(otp.getAttribute('aria-describedby')!)).toHaveTextContent('Ingresa exactamente seis dígitos.');
    expect(calls(`/transfers/${transferId}/confirm`)).toHaveLength(0);
    await user.clear(otp);
    await user.type(otp, '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmar OTP' }));
    expect(await screen.findByText(/OTP_INVALID/)).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
    await user.clear(otp);
    await user.type(otp, '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar OTP' }));
    expect(await screen.findByRole('heading', { name: 'Comprobante de transferencia' })).toBeInTheDocument();
    expect(calls(`/transfers/${transferId}/confirm`)).toHaveLength(2);
  });

  it('REJECTED muestra detalle sin presentar comprobante de éxito', async () => {
    api.fetch.mockImplementation(async path => path === `/transfers/${transferId}` ? result('REJECTED') : Promise.reject(new Error(path)));
    mount(`/transfer/${transferId}`);
    expect(await screen.findByRole('heading', { name: 'Detalle de la operación' })).toBeInTheDocument();
    expect(screen.getByText(/INSUFFICIENT_FUNDS/)).toBeInTheDocument();
    expect(screen.queryByText('Comprobante de transferencia')).not.toBeInTheDocument();
  });

  it('menú navegable con teclado y filtros del historial etiquetados', async () => {
    mount('/dashboard');
    await screen.findByText(formatMxnCents('900000'));
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Resumen de cuentas' })).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Movimientos' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Historial de movimientos' })).toBeInTheDocument();
    const filters = screen.getByRole('form', { name: 'Filtrar movimientos' });
    expect(within(filters).getByLabelText('Cuenta')).toBeInTheDocument();
    expect(within(filters).getByLabelText('Tipo')).toBeInTheDocument();
    expect(within(filters).getByLabelText('Desde')).toBeInTheDocument();
    expect(within(filters).getByLabelText('Hasta')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginación de movimientos' })).toBeInTheDocument();
  });

  it('historial anuncia carga y permite pasar a los resultados sin inventar saldo', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>(r => { resolve = r; });
    api.fetch.mockImplementation(async path => path === '/accounts' ? accounts() : path.startsWith('/movements?') ? pending : Promise.reject(new Error(path)));
    mount('/movements');
    expect(await screen.findByRole('status', { name: 'Cargando movimientos' })).toBeInTheDocument();
    resolve(movements);
    expect(await screen.findByText('T25 integración')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Lista de movimientos' })).toBeInTheDocument();
  });
});
