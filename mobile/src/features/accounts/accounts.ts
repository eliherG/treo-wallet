import type { components } from '@treo/shared';
import type { AuthorizedGet } from '../../api/authorized-get';

export type Account = components['schemas']['Account'];
type AccountsResponse = components['schemas']['AccountsResponse'];

export async function loadAccounts(get: AuthorizedGet): Promise<Account[]> {
  const response = await get<AccountsResponse>('/accounts');
  if (!Array.isArray(response.accounts)) throw new Error('Respuesta de cuentas inválida.');
  return response.accounts;
}
