import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MovementsPage } from '../MovementsPage';

const fixture = vi.hoisted(() => ({ fetch: vi.fn<(path: string) => Promise<unknown>>() }));
vi.mock('../../../app/SessionProvider', () => ({ useSession: () => ({
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, authorizedFetch: fixture.fetch,
}) }));
const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const idA = '33333333-3333-4333-8333-333333333333';
const idB = '44444444-4444-4444-8444-444444444444';
const accounts = { accounts: [
  { id: accountA, clabeMasked: '**************0012', status: 'ACTIVE', currency: 'MXN', balanceCents: '999875' },
  { id: accountB, clabeMasked: '**************0025', status: 'ACTIVE', currency: 'MXN', balanceCents: '200125' },
] };
function movement(id: string, type: 'DEBIT' | 'CREDIT', concept: string, amount: string) {
  return { id, transferId: id, accountId: type === 'DEBIT' ? accountA : accountB,
    type, signedAmountCents: amount, concept, reference: '0023', createdAt: '2026-10-23T12:30:00.000Z' };
}
const firstPage = { items: [movement(idA, 'DEBIT', 'Pago restaurante', '-125'), movement(idB, 'CREDIT', 'Abono nómina', '125')], nextCursor: null };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><MovementsPage /></MemoryRouter></QueryClientProvider>);
}
function callsToHistory() {
  return fixture.fetch.mock.calls.map(([path]) => path).filter(path => path.startsWith('/movements?'));
}
beforeEach(() => {
  fixture.fetch.mockReset();
  fixture.fetch.mockImplementation(async path => path === '/accounts' ? accounts : firstPage);
});
afterEach(() => { fixture.fetch.mockReset(); });

describe('T-24 historial web con filtros y paginación por cursor', () => {
  it('muestra cargo, abono, CLABE enmascarada, referencia y enlace al estado real', async () => {
    mount();
    expect(await screen.findByText('Pago restaurante')).toBeInTheDocument();
    expect(screen.getByText('Abono nómina')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/1[.,]25/).textContent).toContain('−');
    expect(within(rows[1]!).getByText(/1[.,]25/).textContent).toContain('+');
    expect(within(rows[0]!).getByText(/0012/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'Ver transferencia' })).toHaveAttribute('href', `/transfer/${idA}`);
    expect(screen.getByText('Página 1')).toBeInTheDocument();
  });

  it('navega a siguiente página con el cursor del servidor y regresa sin OFFSET', async () => {
    fixture.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts;
      const cursor = new URL(path, 'http://localhost').searchParams.get('cursor');
      if (cursor === 'first/opaque+=') return { items: [movement(idB, 'CREDIT', 'Página segunda', '200')], nextCursor: null };
      return { items: [movement(idA, 'DEBIT', 'Página primera', '-125')], nextCursor: 'first/opaque+=' };
    });
    mount();
    expect(await screen.findByText('Página primera')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Página segunda')).toBeInTheDocument();
    const nextCall = callsToHistory().find(path => path.includes('cursor='));
    expect(new URL(nextCall!, 'http://localhost').searchParams.get('cursor')).toBe('first/opaque+=');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Página primera')).toBeInTheDocument();
    expect(screen.getByText('Página 1')).toBeInTheDocument();
  });

  it('al aplicar otro filtro descarta el cursor anterior y consulta de nuevo desde página uno', async () => {
    fixture.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts;
      const params = new URL(path, 'http://localhost').searchParams;
      if (params.get('type') === 'DEBIT') return { items: [movement(idA, 'DEBIT', 'Cargo filtrado', '-125')], nextCursor: null };
      if (params.get('cursor')) return { items: [movement(idB, 'CREDIT', 'Página dos', '125')], nextCursor: null };
      return { items: [movement(idA, 'DEBIT', 'Página uno', '-125')], nextCursor: 'cursor-from-page-one' };
    });
    mount();
    await screen.findByText('Página uno');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página dos');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'DEBIT');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(await screen.findByText('Cargo filtrado')).toBeInTheDocument();
    const filteredPath = callsToHistory().at(-1)!;
    const params = new URL(filteredPath, 'http://localhost').searchParams;
    expect(params.get('type')).toBe('DEBIT');
    expect(params.get('cursor')).toBeNull();
    expect(screen.getByText('Página 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByText('Página uno')).toBeInTheDocument();
    expect(new URL(callsToHistory().at(-1)!, 'http://localhost').searchParams.get('cursor')).toBeNull();
  });

  it('envía filtros de cuenta y fechas de CDMX sin cursor inicial', async () => {
    mount();
    await screen.findByText('Pago restaurante');
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), accountA);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-22' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-23' } });
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => {
      const url = new URL(callsToHistory().at(-1)!, 'http://localhost');
      expect(url.searchParams.get('accountId')).toBe(accountA);
      expect(url.searchParams.get('from')).toBe('2026-10-22');
      expect(url.searchParams.get('to')).toBe('2026-10-23');
      expect(url.searchParams.get('cursor')).toBeNull();
    });
  });

  it('rechaza fechas invertidas sin enviar otra consulta', async () => {
    mount();
    await screen.findByText('Pago restaurante');
    const count = callsToHistory().length;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-23' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-22' } });
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha inicial no puede superar la fecha final.');
    expect(callsToHistory()).toHaveLength(count);
  });

  it('muestra estado vacío y deshabilita Siguiente cuando no hay más datos', async () => {
    fixture.fetch.mockImplementation(async path => path === '/accounts' ? accounts : { items: [], nextCursor: null });
    mount();
    expect(await screen.findByText(/No hay movimientos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('muestra error del servidor y permite actualizar para recuperarse', async () => {
    let attempts = 0;
    fixture.fetch.mockImplementation(async path => {
      if (path === '/accounts') return accounts;
      attempts++;
      if (attempts === 1) throw new Error('network down');
      return firstPage;
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible consultar el historial.');
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Pago restaurante')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
