import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionProvider';
import { ApiError } from '../../api/http';
import { formatMxnCents } from '../accounts/money';
import type { TransferResponse } from './draft';

export function TransferOtpPage() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { user, authorizedFetch } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const status = useQuery({
    queryKey: ['transfer', user?.id, id], enabled: valid && !!user, retry: false,
    queryFn: () => authorizedFetch<TransferResponse>(`/transfers/${encodeURIComponent(id)}`),
  });
  if (!valid) return <Navigate to="/transfer/new" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (locked.current || !/^[0-9]{6}$/.test(otp)) { setError('Ingresa exactamente seis dígitos.'); return; }
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await authorizedFetch<TransferResponse>(`/transfers/${encodeURIComponent(id)}/confirm`, {
        method: 'POST', body: JSON.stringify({ otp }),
      });
      if (result.transfer.status === 'COMPLETED') {
        cache.setQueryData(['transfer', user?.id, id], result);
        void cache.invalidateQueries({ queryKey: ['transfer', user?.id, id] });
        void cache.invalidateQueries({ queryKey: ['accounts', user?.id] });
        void cache.invalidateQueries({ queryKey: ['movements'] });
        navigate(`/transfer/${id}`, { replace: true });
      } else { await status.refetch(); setError('La transferencia sigue pendiente; consulta su estado.'); }
    } catch (cause) {
      setError(cause instanceof ApiError ? `${cause.message} (${cause.code})` : 'No se confirmó el resultado. Consulta el estado.');
      // If the request was applied but the network reply failed, reconcile with GET.
      await status.refetch();
    } finally { locked.current = false; setBusy(false); }
  };
  const transfer = status.data?.transfer;
  return <section className="content transfer-page">
    <p className="eyebrow">TRANSFERENCIAS · PASO 3 DE 3</p><h1>Confirmación OTP</h1>
    {status.isPending && <p role="status">Consultando estado de la transferencia…</p>}
    {status.isError && <p role="alert" className="banner-error">No fue posible consultar la operación. Intenta actualizar su estado.</p>}
    {transfer?.status === 'COMPLETED' && <p role="status" className="notice">Esta operación ya se completó. <Link to={`/transfer/${id}`}>Ver comprobante</Link></p>}
    {transfer?.status === 'REJECTED' && <p role="alert" className="banner-error">Transferencia rechazada: {transfer.rejectionCode ?? 'sin detalle'}. No hay comprobante de éxito.</p>}
    {transfer?.status === 'PROCESSING' && <p role="status">La operación está en proceso. Verifica el estado antes de realizar otra acción.</p>}
    {transfer?.status === 'PENDING_CONFIRMATION' && <div className="surface">
      <p>Importe: <strong>{formatMxnCents(transfer.amountCents)}</strong></p>
      <p className="inline-note">Código de demostración configurado en el backend local. Nunca utilices un OTP real en este entorno.</p>
      <form className="form-grid" onSubmit={event => void submit(event)} noValidate>
        <label htmlFor="tr-otp">Código OTP de 6 dígitos</label>
        <input id="tr-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/[^0-9]/g, ''))}/>
        {error && <p role="alert" className="banner-error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Verificando…' : 'Confirmar OTP'}</button>
      </form>
    </div>}
    <div className="transfer-actions"><button type="button" className="btn-quiet" disabled={busy || status.isFetching} onClick={() => void status.refetch()}>Actualizar estado</button><Link to={`/transfer/${id}`}>Ver estado de la operación</Link></div>
  </section>;
}
