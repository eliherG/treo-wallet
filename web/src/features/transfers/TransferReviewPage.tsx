import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../app/SessionProvider';
import { ApiError } from '../../api/http';
import { formatMxnCents } from '../accounts/money';
import { useTransferFlow } from './TransferFlow';
import { toCents, type TransferResponse } from './draft';

export function TransferReviewPage() {
  const { draft, clear } = useTransferFlow();
  const { user, authorizedFetch } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const inFlight = useRef(false);
  // Avoid draft-clear redirecting back to /transfer/new while route navigation commits.
  const departing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [knownId, setKnownId] = useState<string | null>(null);
  if (!draft) return departing.current ? null : <Navigate to="/transfer/new" replace />;
  const { form, request, key, sourceLabel, targetLabel } = draft;
  const confirm = async () => {
    // Ref guard runs synchronously, before React batches the disabled state.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      const response = await authorizedFetch<TransferResponse>('/transfers', {
        method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(request),
      });
      const result = response.transfer;
      if (result.status === 'COMPLETED') {
        void cache.invalidateQueries({ queryKey: ['accounts', user?.id] });
        void cache.invalidateQueries({ queryKey: ['movements'] });
        departing.current = true;
        navigate(`/transfer/${result.id}`, { replace: true });
        clear();
      } else if (result.status === 'PENDING_CONFIRMATION') {
        cache.setQueryData(['transfer', user?.id, result.id], response);
        departing.current = true;
        navigate(`/transfer/otp?id=${encodeURIComponent(result.id)}`, { replace: true });
        clear();
      } else {
        // Never show a receipt for a non-final or rejected server status.
        setKnownId(result.id);
        setError('La transferencia no está completada. Consulta su estado antes de intentarla de nuevo.');
        setUncertain(true);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.code !== 'TRANSFER_IN_PROGRESS') {
        setError(`${cause.message} (${cause.code})`);
        setUncertain(false);
      } else {
        setError('No se confirmó el resultado. Puedes reintentar con la misma intención sin generar otra llave.');
        setUncertain(true);
      }
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="content transfer-page">
    <p className="eyebrow">TRANSFERENCIAS · PASO 2 DE 3</p><h1>Revisa tu transferencia</h1>
    <p className="muted">Comprueba la información antes de confirmar. El monto se enviará en centavos exactos.</p>
    <div className="surface">
      <dl className="transfer-summary">
        <div><dt>Origen</dt><dd>{sourceLabel}</dd></div>
        <div><dt>Destino</dt><dd>{targetLabel}</dd></div>
        <div><dt>Importe</dt><dd className="transfer-total">{formatMxnCents(toCents(form.amount).toString())}</dd></div>
        <div><dt>Concepto</dt><dd>{form.concept}</dd></div>
        <div><dt>Referencia</dt><dd>{form.reference}</dd></div>
      </dl>
      <p className="inline-note">Si la operación requiere OTP, primero se creará una intención pendiente; no se descontará dinero hasta confirmarla.</p>
      {error && <p role="alert" className="banner-error">{error}</p>}
      {uncertain && <p role="status" className="inline-note">Se conserva la misma llave de idempotencia para el reintento. No crees una operación nueva hasta conocer el estado de esta. {knownId && <Link to={`/transfer/${knownId}`}>Consultar estado</Link>}</p>}
      <div className="transfer-actions">
        <Link to="/transfer/new" className="btn-quiet" aria-disabled={busy} onClick={event => { if (busy || uncertain) event.preventDefault(); }}>Editar datos</Link>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Procesando…' : uncertain ? 'Reintentar misma intención' : 'Confirmar transferencia'}</button>
      </div>
    </div>
  </section>;
}
