import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { components } from '@treo/shared';
import { useSession } from '../../app/SessionProvider';
import { formatMxnCents } from '../accounts/money';
import { createTransferDraft, parseTransferForm, type TransferForm } from './draft';
import { useTransferFlow } from './TransferFlow';

type AccountsResponse = components['schemas']['AccountsResponse'];
type BeneficiariesResponse = components['schemas']['BeneficiariesResponse'];
const initial: TransferForm = { mode: 'OWN_ACCOUNTS', sourceAccountId: '', targetId: '', amount: '', concept: '', reference: '' };

export function TransferNewPage() {
  const { user, authorizedFetch } = useSession();
  const { draft, save } = useTransferFlow();
  const navigate = useNavigate();
  const [fields, setFields] = useState<TransferForm>(() => draft?.form ?? initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const accounts = useQuery({ queryKey: ['accounts', user?.id], enabled: !!user, queryFn: () => authorizedFetch<AccountsResponse>('/accounts') });
  const beneficiaries = useQuery({ queryKey: ['beneficiaries', user?.id], enabled: !!user && fields.mode === 'BENEFICIARY', queryFn: () => authorizedFetch<BeneficiariesResponse>('/beneficiaries') });
  const sourceList = accounts.data?.accounts.filter(a => a.status === 'ACTIVE') ?? [];
  const ownTargets = sourceList.filter(a => a.id !== fields.sourceAccountId);
  const recipients = fields.mode === 'OWN_ACCOUNTS' ? ownTargets : (beneficiaries.data?.beneficiaries ?? []).filter(b => b.isInternal);
  const loading = accounts.isPending || (fields.mode === 'BENEFICIARY' && beneficiaries.isPending);
  const failed = accounts.isError || (fields.mode === 'BENEFICIARY' && beneficiaries.isError);
  const set = <K extends keyof TransferForm>(key: K, value: TransferForm[K]) => {
    setFields(prev => ({ ...prev, [key]: value }));
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseTransferForm(fields);
    const failures = { ...parsed.errors };
    if (!sourceList.some(item => item.id === fields.sourceAccountId)) failures.sourceAccountId = 'Selecciona una cuenta de origen activa.';
    if (!recipients.some(item => item.id === fields.targetId)) failures.targetId = 'Selecciona un destino disponible.';
    setErrors(failures);
    if (Object.keys(failures).length) return;
    // Saving from the form is always a new intention and therefore a new key.
    const source = sourceList.find(item => item.id === fields.sourceAccountId);
    const target = recipients.find(item => item.id === fields.targetId);
    if (!source || !target) return;
    const sourceLabel = `CLABE ${source.clabeMasked}`;
    const targetLabel = 'alias' in target ? `${target.alias} · ${target.clabeMasked}` : `CLABE ${target.clabeMasked}`;
    save(createTransferDraft(fields, sourceLabel, targetLabel));
    navigate('/transfer/review');
  };
  return <section className="content transfer-page">
    <p className="eyebrow">TRANSFERENCIAS · PASO 1 DE 3</p><h1>Nueva transferencia</h1>
    <p className="muted">Captura tu instrucción; revisaremos cada dato antes de enviarla.</p>
    {loading && <p role="status">Cargando cuentas y destinatarios…</p>}
    {failed && <p role="alert" className="banner-error">No se pudieron consultar tus cuentas o beneficiarios. Vuelve a intentarlo.</p>}
    <form className="surface form-grid" onSubmit={submit} noValidate>
      <label htmlFor="tr-mode">Tipo de transferencia</label>
      <select id="tr-mode" value={fields.mode} onChange={event => { setFields(prev => ({ ...prev, mode: event.target.value as TransferForm['mode'], targetId: '' })); setErrors({}); }}>
        <option value="OWN_ACCOUNTS">Entre mis cuentas</option><option value="BENEFICIARY">A un beneficiario interno</option>
      </select>
      <label htmlFor="tr-source">Cuenta de origen</label>
      <select id="tr-source" value={fields.sourceAccountId} onChange={event => { setFields(prev => ({ ...prev, sourceAccountId: event.target.value, targetId: prev.mode === 'OWN_ACCOUNTS' ? '' : prev.targetId })); setErrors({}); }} aria-invalid={!!errors.sourceAccountId}>
        <option value="">Selecciona una cuenta</option>
        {sourceList.map(item => <option key={item.id} value={item.id}>CLABE {item.clabeMasked} · {formatMxnCents(item.balanceCents)}</option>)}
      </select>
      {errors.sourceAccountId && <small role="alert" className="field-error">{errors.sourceAccountId}</small>}
      <label htmlFor="tr-target">{fields.mode === 'OWN_ACCOUNTS' ? 'Cuenta destino propia' : 'Beneficiario interno'}</label>
      <select id="tr-target" value={fields.targetId} onChange={event => set('targetId', event.target.value)} aria-invalid={!!errors.targetId}>
        <option value="">Selecciona un destino</option>
        {recipients.map(item => <option key={item.id} value={item.id}>{'alias' in item ? `${item.alias} · ${item.clabeMasked}` : `CLABE ${item.clabeMasked}`}</option>)}
      </select>
      {errors.targetId && <small role="alert" className="field-error">{errors.targetId}</small>}
      {fields.mode === 'BENEFICIARY' && !beneficiaries.isPending && recipients.length === 0 && <p role="status" className="inline-note">No tienes beneficiarios internos. Agrega uno antes de transferir.</p>}
      <label htmlFor="tr-amount">Monto (MXN)</label>
      <input id="tr-amount" inputMode="decimal" autoComplete="off" placeholder="1500.25" value={fields.amount} onChange={event => set('amount', event.target.value)} aria-invalid={!!errors.amount}/>
      {errors.amount && <small role="alert" className="field-error">{errors.amount}</small>}
      <label htmlFor="tr-concept">Concepto</label>
      <input id="tr-concept" maxLength={140} value={fields.concept} onChange={event => set('concept', event.target.value)} aria-invalid={!!errors.concept}/>
      {errors.concept && <small role="alert" className="field-error">{errors.concept}</small>}
      <label htmlFor="tr-reference">Referencia numérica (1 a 7 dígitos)</label>
      <input id="tr-reference" inputMode="numeric" maxLength={7} autoComplete="off" value={fields.reference} onChange={event => set('reference', event.target.value)} aria-invalid={!!errors.reference}/>
      {errors.reference && <small role="alert" className="field-error">{errors.reference}</small>}
      <button className="btn-primary" type="submit" disabled={loading || failed}>Revisar transferencia</button>
    </form>
  </section>;
}
