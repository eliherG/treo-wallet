import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BeneficiariesPage } from '../BeneficiariesPage';
import { ApiError } from '../../../api/http';

const authorizedFetch = vi.fn(async (path: string, init?: RequestInit): Promise<unknown> => {
  if (path === '/beneficiaries' && !init) return { beneficiaries: [] };
  throw new ApiError(409, 'BENEFICIARY_ALREADY_EXISTS', 'La CLABE ya está registrada.');
});
vi.mock('../../../app/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'fixture-1' }, authorizedFetch }),
}));
afterEach(() => { authorizedFetch.mockClear(); });
function mount() {
  const client = new QueryClient({ defaultOptions: {queries: {retry: false}}});
  return render(<QueryClientProvider client={client}><BeneficiariesPage /></QueryClientProvider>);
}
it('T-22 muestra lista vacía y rechaza CLABE inválida sin POST', async () => {
  mount();
  expect(await screen.findByText(/Todavía no tienes beneficiarios/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ejemplo');
  await userEvent.type(screen.getByLabelText('Alias'), 'Demo');
  await userEvent.type(screen.getByLabelText('CLABE interbancaria'), '032180000118359718');
  await userEvent.click(screen.getByRole('button', {name: /guardar beneficiario/i}));
  expect(await screen.findByText(/dígito verificador/)).toBeInTheDocument();
  expect(authorizedFetch).toHaveBeenCalledTimes(1);
});
it('T-22 muestra rechazo controlado al duplicar una CLABE', async () => {
  mount();
  await screen.findByText(/Todavía no tienes beneficiarios/);
  await userEvent.type(screen.getByLabelText('Nombre'), 'Ejemplo');
  await userEvent.type(screen.getByLabelText('Alias'), 'Demo');
  await userEvent.type(screen.getByLabelText('CLABE interbancaria'), '032180000118359719');
  await userEvent.click(screen.getByRole('button', {name: /guardar beneficiario/i}));
  expect(await screen.findByRole('alert')).toHaveTextContent('La CLABE ya está registrada.');
});
