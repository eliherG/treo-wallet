import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../app/SessionProvider';
import { formatMxnCents } from '../accounts/money';
import type { TransferResponse } from './draft';

export function TransferStatusPage() {
  const { id = '' } = useParams();
  const { user, authorizedFetch } = useSession();
  const cache = useQueryClient();
  const refreshed = useRef<string | null>(null);
  const status = useQuery({
    queryKey: ['transfer', user?.id, id], enabled: Boolean(id && user), retry: false,
    queryFn: () => authorizedFetch<TransferResponse>(`/transfers/${encodeURIComponent(id)}`),
  });
  const transfer = status.data?.transfer;
  useEffect(() => {
    if (transfer?.status !== 'COMPLETED' || refreshed.current === transfer.id) return;
    refreshed.current = transfer.id;
    void cache.invalidateQueries({ queryKey: ['accounts', user?.id] });
    void cache.invalidateQueries({ queryKey: ['movements'] });
  }, [transfer?.status, transfer?.id, cache, user?.id]);
  const completed = transfer?.status === 'COMPLETED';
  return <section className="content transfer-page">
    <p className="eyebrow">CONSULTA DE OPERACIÓN</p><h1>Estado de transferencia</h1>
    {status.isPending && <p role="status">Consultando transferencia…</p>}
    {status.isError && <p role="alert" className="banner-error">No fue posible recuperar la transferencia. Comprueba tu sesión y el identificador.</p>}
    {transfer && <div className="surface">
      <p role="status" className={completed ? 'notice' : transfer.status === 'REJECTED' ? 'banner-error' : 'inline-note'}>
        {completed ? 'Transferencia completada' : transfer.status === 'PENDING_CONFIRMATION' ? 'Pendiente de código OTP' : transfer.status === 'PROCESSING' ? 'Procesando transferencia' : 'Transferencia rechazada'}
      </p>
      <h2>{completed ? 'Comprobante de transferencia' : 'Detalle de la operación'}</h2>
      <dl className="transfer-summary">
        <div><dt>Folio</dt><dd>{transfer.id}</dd></div>
        <div><dt>Monto</dt><dd className="transfer-total">{formatMxnCents(transfer.amountCents)}</dd></div>
        <div><dt>Origen</dt><dd>{transfer.sourceAccountId}</dd></div>
        <div><dt>Destino</dt><dd>{transfer.destinationAccountMasked}</dd></div>
        <div><dt>Concepto</dt><dd>{transfer.concept}</dd></div>
        <div><dt>Referencia</dt><dd>{transfer.reference}</dd></div>
        <div><dt>Creación</dt><dd>{new Date(transfer.createdAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</dd></div>
        {completed && transfer.completedAt && <div><dt>Completada</dt><dd>{new Date(transfer.completedAt).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</dd></div>}
        {transfer.status === 'REJECTED' && <div><dt>Motivo</dt><dd>{transfer.rejectionCode ?? 'No disponible'}</dd></div>}
      </dl>
      {transfer.status === 'PENDING_CONFIRMATION' && <Link className="btn-primary transfer-action-link" to={`/transfer/otp?id=${encodeURIComponent(transfer.id)}`}>Confirmar con OTP</Link>}
      {!completed && <p className="inline-note">Esto no es un comprobante de éxito. Consulta de nuevo el estado antes de crear otra operación.</p>}
    </div>}
    <div className="transfer-actions"><button type="button" className="btn-quiet" disabled={status.isFetching} onClick={() => void status.refetch()}>Actualizar estado</button><Link to="/transfer/new">Nueva transferencia</Link></div>
  </section>;
}
