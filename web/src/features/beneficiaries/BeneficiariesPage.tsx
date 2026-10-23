import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@treo/shared';
import { z } from 'zod';
import { useSession } from '../../app/SessionProvider';
import { ApiError } from '../../api/http';
import { isValidClabe } from './clabe';

type Response = components['schemas']['BeneficiariesResponse'];
type CreateRequest = components['schemas']['CreateBeneficiaryRequest'];
type Beneficiary = components['schemas']['Beneficiary'];
const schema = z.object({
  name: z.string().trim().min(1, 'Ingresa un nombre.').max(100),
  alias: z.string().trim().min(1, 'Ingresa un alias.').max(80),
  clabe: z.string().regex(/^[0-9]{18}$/, 'La CLABE debe tener exactamente 18 dígitos.')
    .refine(isValidClabe, 'El dígito verificador de la CLABE no coincide.'),
});
export function BeneficiariesPage() {
  const { user, authorizedFetch } = useSession();
  const cache = useQueryClient();
  const [name, setName] = useState(''); const [alias, setAlias] = useState(''); const [clabe, setClabe] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverMessage, setServerMessage] = useState(''); const [notice, setNotice] = useState('');
  const queryKey = ['beneficiaries', user?.id];
  const list = useQuery({ queryKey, enabled: Boolean(user), queryFn: () => authorizedFetch<Response>('/beneficiaries') });
  const create = useMutation({
    mutationFn: (input: CreateRequest) => authorizedFetch<Beneficiary>('/beneficiaries', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async () => { setName(''); setAlias(''); setClabe(''); setNotice('Beneficiario agregado.'); await cache.invalidateQueries({queryKey}); },
    onError: (error: unknown) => { setServerMessage(error instanceof ApiError ? error.message : 'No fue posible guardar el beneficiario.'); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault(); setErrors({}); setServerMessage(''); setNotice('');
    const parsed = schema.safeParse({ name, alias, clabe });
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(i => [i.path[0], i.message]))); return; }
    create.mutate(parsed.data);
  };
  return <section className="content"><p className="eyebrow">TUS CONTACTOS FINANCIEROS</p><h1>Beneficiarios</h1><p className="muted">Guarda CLABEs verificadas y consulta tus destinatarios.</p>
    <div className="split-layout">
      <section className="surface"><h2>Beneficiarios guardados</h2>
        {list.isPending && <p role="status">Cargando beneficiarios…</p>}
        {list.isError && <p role="alert" className="banner-error">No fue posible cargar tus beneficiarios.</p>}
        {list.isSuccess && list.data.beneficiaries.length === 0 && <p className="empty-state">Todavía no tienes beneficiarios. Agrega el primero.</p>}
        {list.isSuccess && <ul className="list-clean">{list.data.beneficiaries.map(item => <li key={item.id}>
          <div><strong>{item.alias}</strong><p className="muted" style={{margin:'4px 0'}}>{item.name}</p><small>{item.clabeMasked}</small></div>
          <span className={item.isInternal?'pill':'inline-note'}>{item.isInternal?'Interno':'Externo'}</span>
        </li>)}</ul>}
      </section>
      <section className="surface"><h2>Nuevo beneficiario</h2><p className="inline-note">La CLABE debe tener 18 dígitos y un checksum válido.</p>
        <form className="form-grid" onSubmit={submit} noValidate>
          <label htmlFor="ben-name">Nombre</label><input id="ben-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} aria-invalid={!!errors.name}/>{errors.name && <span role="alert" className="field-error">{errors.name}</span>}
          <label htmlFor="ben-alias">Alias</label><input id="ben-alias" value={alias} maxLength={80} onChange={e => setAlias(e.target.value)} aria-invalid={!!errors.alias}/>{errors.alias && <span role="alert" className="field-error">{errors.alias}</span>}
          <label htmlFor="ben-clabe">CLABE interbancaria</label><input id="ben-clabe" value={clabe} inputMode="numeric" autoComplete="off" maxLength={18} onChange={e => setClabe(e.target.value)} aria-invalid={!!errors.clabe}/>{errors.clabe && <span role="alert" className="field-error">{errors.clabe}</span>}
          {serverMessage && <p role="alert" className="banner-error">{serverMessage}</p>}
          {notice && <p role="status" className="notice">{notice}</p>}
          <button className="btn-primary" type="submit" disabled={create.isPending}>{create.isPending?'Guardando…':'Guardar beneficiario'}</button>
        </form>
      </section>
    </div>
  </section>;
}
