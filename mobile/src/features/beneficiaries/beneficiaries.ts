import type { components } from '@treo/shared';
import type { AuthorizedGet } from '../../api/authorized-get';

export type Beneficiary = components['schemas']['Beneficiary'];
type BeneficiariesResponse = components['schemas']['BeneficiariesResponse'];

/** Read-only in mobile. Beneficiary creation and CLABE checks stay on web. */
export async function loadBeneficiaries(get: AuthorizedGet): Promise<Beneficiary[]> {
  const response = await get<BeneficiariesResponse>('/beneficiaries');
  if (!Array.isArray(response.beneficiaries)) throw new Error('Respuesta de beneficiarios inválida.');
  return response.beneficiaries;
}

/** Store only the authorized resource ID; T-28 will use it as beneficiaryId. */
export function selectBeneficiary(items: Beneficiary[], id: string): Beneficiary | null {
  return items.find(item => item.id === id) ?? null;
}
