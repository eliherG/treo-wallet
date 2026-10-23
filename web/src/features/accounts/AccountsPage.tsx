import { useQuery } from '@tanstack/react-query';
import type { components } from '@treo/shared';
import { useSession } from '../../app/SessionProvider';
import { formatMxnCents } from './money';

type AccountsResponse = components['schemas']['AccountsResponse'];
export function AccountsPage() {
  const { user, authorizedFetch } = useSession();
  const accounts = useQuery({
    queryKey: ['accounts', user?.id], enabled: Boolean(user),
    queryFn: () => authorizedFetch<AccountsResponse>('/accounts'),
  });
  return <section className="content">
    <p className="eyebrow">TU DINERO, A SIMPLE VISTA</p>
    <div className="section-heading"><div><h1>Resumen de cuentas</h1><p className="muted">Consulta tus saldos en pesos mexicanos.</p></div>
      <button type="button" className="btn-quiet" onClick={() => void accounts.refetch()} disabled={accounts.isFetching}>Actualizar</button></div>
    {accounts.isPending && <p role="status">Cargando cuentas…</p>}
    {accounts.isError && <p role="alert" className="banner-error">No fue posible consultar tus cuentas. Intenta nuevamente.</p>}
    {accounts.isSuccess && accounts.data.accounts.length === 0 && <div className="surface empty-state">Todavía no tienes cuentas asociadas.</div>}
    {accounts.isSuccess && accounts.data.accounts.length > 0 && <div className="account-grid">
      {accounts.data.accounts.map(account => <article className="surface" key={account.id}>
        <div className="section-heading"><span className="balance-label">Cuenta en pesos · MXN</span><span className={'pill'+(account.status==='BLOCKED'?' pill-blocked':'')}>{account.status==='ACTIVE'?'Activa':'Bloqueada'}</span></div>
        <p className="balance-value">{formatMxnCents(account.balanceCents)}</p>
        <div className="account-meta"><span>CLABE {account.clabeMasked}</span><span>Saldo disponible</span></div>
      </article>)}
    </div>}
    <p className="inline-note" style={{marginTop:18}}>Los saldos se obtienen directamente de la API. No se estiman movimientos pendientes.</p>
  </section>;
}
