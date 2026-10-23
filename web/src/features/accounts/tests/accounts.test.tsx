import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountsPage } from '../AccountsPage';
vi.mock('../../../app/SessionProvider', () => ({ useSession: () => ({
  user: { id: 'fixture-1' }, authorizedFetch: async () => ({ accounts: [
    { id: 'a-1', clabeMasked: '**************1234', balanceCents: '12345', currency: 'MXN', status: 'ACTIVE' },
  ] }),
}) }));
afterEach(() => { vi.restoreAllMocks(); });
it('T-22 renderiza cuenta propia y centavos exactos', async () => {
  const client = new QueryClient({ defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><AccountsPage /></QueryClientProvider>);
  expect(await screen.findByText(/123[.,]45/)).toBeInTheDocument();
  expect(screen.getByText(/\*{14}1234/)).toBeInTheDocument();
});
