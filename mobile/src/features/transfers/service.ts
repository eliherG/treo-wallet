import { MobileAuthError } from '../../auth/controller';
import type { AuthorizedGet } from '../../api/authorized-get';
import type { AuthorizedPost } from '../../api/authorized-post';
import type { Transfer, TransferRequest, TransferResponse } from './draft';

export type TransferService = {
  send(request: TransferRequest, key: string): Promise<Transfer>;
  get(id: string): Promise<Transfer>;
  confirm(id: string, otp: string): Promise<Transfer>;
};

function unwrap(value: TransferResponse): Transfer {
  const transfer = value?.transfer;
  if (!transfer || typeof transfer.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transfer.id) ||
    !['PROCESSING', 'PENDING_CONFIRMATION', 'COMPLETED', 'REJECTED'].includes(transfer.status) ||
    !/^[0-9]+$/.test(transfer.amountCents) || !transfer.sourceAccountId ||
    !transfer.destinationAccountMasked) {
    throw new MobileAuthError(0, 'INVALID_TRANSFER', 'Respuesta de transferencia incompleta.');
  }
  return transfer;
}

export function createTransferService(get: AuthorizedGet, post: AuthorizedPost): TransferService {
  return {
    send: async (request, key) => unwrap(await post<TransferResponse>('/transfers', request, key)),
    get: async id => unwrap(await get<TransferResponse>(`/transfers/${encodeURIComponent(id)}`)),
    confirm: async (id, otp) => {
      if (!/^[0-9]{6}$/.test(otp)) throw new MobileAuthError(0, 'INVALID_OTP', 'Escribe un OTP de seis dígitos.');
      return unwrap(await post<TransferResponse>(`/transfers/${encodeURIComponent(id)}/confirm`, { otp }));
    },
  };
}
