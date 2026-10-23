import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { components } from '@treo/shared';
import { useSession } from '../../app/SessionProvider';
import {
  buildMovementsPath, emptyMovementFilters, formatSignedMovementCents,
  movementDateInMexico, movementFilterError, type MovementFilters,
} from './filters';

type AccountsResponse = components['schemas']['AccountsResponse'];
type MovementsResponse = components['schemas']['MovementsResponse'];

export function MovementsPage() {
  const { user, authorizedFetch } = useSession();
  // Draft inputs never affect an in-flight cursor. Only "Aplicar filtros" commits them.
  const [draft, setDraft] = useState<MovementFilters>({ ...emptyMovementFilters });
  const [active, setActive] = useState<MovementFilters>({ ...emptyMovementFilters });
  const [error, setError] = useState('');
  // Previous page cursors are maintained locally. PostgreSQL never uses OFFSET.
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const cursor = pageCursors[pageIndex] ?? null;

  const accounts = useQuery({
    queryKey: ['accounts', user?.id], enabled: Boolean(user),
    queryFn: () => authorizedFetch<AccountsResponse>('/accounts'),
  });
  const history = useQuery({
    queryKey: ['movements', user?.id, active.accountId, active.type, active.from, active.to, cursor],
    enabled: Boolean(user), retry: false,
    queryFn: () => authorizedFetch<MovementsResponse>(buildMovementsPath(active, cursor)),
  });

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = movementFilterError(draft);
    if (problem) { setError(problem); return; }
    if (draft.accountId && !accounts.data?.accounts.some(account => account.id === draft.accountId)) {
      setError('Selecciona una cuenta propia disponible.');
      return;
    }
    setError('');
    setActive({ ...draft });
    setPageCursors([null]);
    setPageIndex(0);
  };
  const reset = () => {
    setDraft({ ...emptyMovementFilters });
    setActive({ ...emptyMovementFilters });
    setPageCursors([null]);
    setPageIndex(0);
    setError('');
  };
  const next = () => {
    const nextCursor = history.data?.nextCursor;
    if (!nextCursor || history.isFetching) return;
    setPageCursors(before => [...before.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex(index => index + 1);
  };
  const previous = () => { if (!history.isFetching) setPageIndex(index => Math.max(0, index - 1)); };

  return <section className="content movements-page">
    <p className="eyebrow">TUS OPERACIONES · MXN</p>
    <h1>Historial de movimientos</h1>
    <p className="muted">Consulta cargos y abonos de tus cuentas; las fechas se interpretan en Ciudad de México.</p>
    <form className="surface movements-filters" onSubmit={apply} noValidate aria-label="Filtrar movimientos">
      <div className="movements-fields">
        <div><label htmlFor="movement-account">Cuenta</label>
          <select id="movement-account" value={draft.accountId} onChange={event => setDraft(old => ({...old, accountId: event.target.value}))}>
            <option value="">Todas mis cuentas</option>
            {accounts.data?.accounts.map(account => <option key={account.id} value={account.id}>CLABE {account.clabeMasked}</option>)}
          </select>
        </div>
        <div><label htmlFor="movement-type">Tipo</label>
          <select id="movement-type" value={draft.type} onChange={event => setDraft(old => ({...old, type: event.target.value as MovementFilters['type']}))}>
            <option value="">Todos</option><option value="DEBIT">Cargos</option><option value="CREDIT">Abonos</option>
          </select>
        </div>
        <div><label htmlFor="movement-from">Desde</label>
          <input id="movement-from" type="date" value={draft.from} onChange={event => setDraft(old => ({...old, from: event.target.value}))}/>
        </div>
        <div><label htmlFor="movement-to">Hasta</label>
          <input id="movement-to" type="date" value={draft.to} onChange={event => setDraft(old => ({...old, to: event.target.value}))}/>
        </div>
      </div>
      {error && <p role="alert" className="banner-error">{error}</p>}
      {accounts.isError && <p role="alert" className="banner-error">No pudimos consultar tus cuentas. Puedes filtrar por tipo y fecha.</p>}
      <div className="movements-actions">
        <button type="submit" className="btn-primary" disabled={history.isFetching}>Aplicar filtros</button>
        <button type="button" className="btn-quiet" onClick={reset}>Limpiar filtros</button>
      </div>
    </form>

    <div className="section-heading movements-title">
      <h2>Movimientos</h2>
      <button className="btn-quiet" type="button" disabled={history.isFetching} onClick={() => void history.refetch()}>Actualizar</button>
    </div>
    {history.isPending && <div role="status" aria-label="Cargando movimientos" className="surface movements-skeleton">
      <p>Cargando movimientos…</p><div/><div/><div/>
    </div>}
    {history.isError && <div role="alert" className="surface banner-error">
      No fue posible consultar el historial. Vuelve a intentarlo.
    </div>}
    {history.isSuccess && history.data.items.length === 0 && <div className="surface empty-state">No hay movimientos para los filtros seleccionados.</div>}
    {history.isSuccess && history.data.items.length > 0 && <ul className="surface movements-list" aria-label="Lista de movimientos">
      {history.data.items.map(item => <li key={item.id} className="movement-row">
        <div className="movement-info">
          <span className="movement-type">{item.type === 'DEBIT' ? 'Cargo' : 'Abono'}</span>
          <strong>{item.concept}</strong>
          <span className="movement-meta">{movementDateInMexico(item.createdAt)} · Ref. {item.reference}</span>
          <span className="movement-meta">Cuenta {accounts.data?.accounts.find(account => account.id === item.accountId)?.clabeMasked ?? 'propia'}</span>
          <Link to={`/transfer/${encodeURIComponent(item.transferId)}`}>Ver transferencia</Link>
        </div>
        <strong className={item.type === 'DEBIT' ? 'movement-debit' : 'movement-credit'}>{formatSignedMovementCents(item.signedAmountCents)}</strong>
      </li>)}
    </ul>}
    {history.isSuccess && <nav aria-label="Paginación de movimientos" className="movements-pagination">
      <button type="button" className="btn-quiet" onClick={previous} disabled={pageIndex === 0 || history.isFetching}>Anterior</button>
      <span aria-live="polite">Página {pageIndex + 1}</span>
      <button type="button" className="btn-quiet" onClick={next} disabled={!history.data.nextCursor || history.isFetching}>Siguiente</button>
    </nav>}
    <p className="inline-note">El historial utiliza cursores protegidos por el servidor; no se calculan saldos a partir de esta lista.</p>
  </section>;
}
