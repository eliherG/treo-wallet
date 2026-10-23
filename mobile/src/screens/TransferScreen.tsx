import { useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { loadAccounts, type Account } from '../features/accounts/accounts';
import { formatMxnCents } from '../features/accounts/money';
import { loadBeneficiaries, type Beneficiary } from '../features/beneficiaries/beneficiaries';
import { movementDateInMexico } from '../features/movements/movements';
import { type TransferForm, type TransferMode, validateDraft } from '../features/transfers/draft';
import { MobileTransferManager, type TransferState } from '../features/transfers/manager';
import { securePendingIntentStore } from '../features/transfers/secure-intent';
import { createTransferService } from '../features/transfers/service';

const emptyForm: TransferForm = {
  mode: 'OWN_ACCOUNTS', sourceAccountId: '', targetId: '', amount: '', concept: '', reference: '',
};

function Action({ title, onPress, disabled, secondary = false }: {
  title: string; onPress(): void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} style={[styles.action, secondary ? styles.secondary : styles.primary, disabled && styles.disabled]}>
    <Text style={[styles.actionText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

function Row({ title, value }: { title: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{title}</Text><Text selectable style={styles.value}>{value}</Text></View>;
}

export function TransferScreen() {
  const { user, authorizedGet, authorizedPost } = useSession();
  const [form, setForm] = useState<TransferForm>(emptyForm);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<TransferState>({ phase: 'editing', intent: null, transfer: null, error: null });
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const mounted = useRef(true);
  const manager = useMemo(() => new MobileTransferManager(user?.id ?? '', securePendingIntentStore,
    createTransferService(authorizedGet, authorizedPost)), [user?.id, authorizedGet, authorizedPost]);

  async function loadLists() {
    setLoadError(null);
    try {
      const [a, b] = await Promise.all([loadAccounts(authorizedGet), loadBeneficiaries(authorizedGet)]);
      if (!mounted.current) return;
      setAccounts(a); setBeneficiaries(b);
      setForm(previous => ({ ...previous, sourceAccountId: previous.sourceAccountId || a.find(x => x.status === 'ACTIVE')?.id || '' }));
    } catch (e) {
      if (mounted.current) setLoadError(e instanceof Error ? e.message : 'No fue posible cargar las cuentas.');
    }
  }

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const restored = await manager.restore();
        if (mounted.current) setState({ ...restored });
      } catch (error) {
        if (mounted.current) setLoadError(error instanceof Error ? error.message : 'No se pudo restaurar la intención pendiente.');
      } finally { if (mounted.current) setLoaded(true); }
      if (mounted.current) await loadLists();
    })();
    return () => { mounted.current = false; };
  // One load per mounted screen/session. Identity of authorizedGet/manager is stable in SessionProvider.
  }, [manager]);

  async function run(action: () => Promise<TransferState>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      if (mounted.current) setState({ ...result });
      if (result.phase === 'completed' && mounted.current) void loadLists();
    } catch (error) {
      if (mounted.current) setLoadError(error instanceof Error ? error.message : 'Ocurrió un error.');
    } finally { if (mounted.current) setBusy(false); }
  }

  const draftCheck = validateDraft(form, accounts, beneficiaries);
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');
  const candidates = form.mode === 'OWN_ACCOUNTS'
    ? activeAccounts.filter(a => a.id !== form.sourceAccountId).map(a => ({ id: a.id, title: `Cuenta ${a.clabeMasked}` }))
    : beneficiaries.filter(b => b.isInternal).map(b => ({ id: b.id, title: `${b.alias} · ${b.clabeMasked}` }));
  const intent = state.intent;
  const transfer = state.transfer;

  if (!loaded) return <View style={styles.panel}><ActivityIndicator color="#087e79"/><Text>Recuperando transferencias pendientes…</Text></View>;

  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.heading}>Transferencias</Text>
    <Text style={styles.hint}>Solo cuentas propias o beneficiarios internos. Las transferencias externas no están disponibles.</Text>
    {loadError ? <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
      <Action secondary title="Reintentar consultas" onPress={() => void loadLists()} disabled={busy}/></View> : null}
    {state.error ? <Text accessibilityRole="alert" style={state.phase === 'unknown' ? styles.warning : styles.error}>{state.error}</Text> : null}

    {state.phase === 'editing' ? <View style={styles.panel}>
      <Text style={styles.step}>PASO 1 · CAPTURA</Text>
      <Text style={styles.label}>Cuenta de origen</Text>
      {activeAccounts.length === 0 ? <Text style={styles.warning}>No hay cuentas activas disponibles.</Text> : activeAccounts.map(account =>
        <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ checked: form.sourceAccountId === account.id }}
          style={[styles.choice, form.sourceAccountId === account.id && styles.selected]}
          onPress={() => setForm(prev => ({ ...prev, sourceAccountId: account.id, targetId: '' }))}>
          <Text style={styles.value}>{account.clabeMasked} · {formatMxnCents(account.balanceCents)}</Text>
        </Pressable>)}
      <Text style={styles.label}>Tipo de destinatario</Text>
      <View style={styles.switches}>
        {(['OWN_ACCOUNTS', 'BENEFICIARY'] as TransferMode[]).map(mode =>
          <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: form.mode === mode }}
            style={[styles.mode, form.mode === mode && styles.modeOn]}
            onPress={() => setForm(prev => ({ ...prev, mode, targetId: '' }))}>
            <Text style={form.mode === mode ? styles.modeTextOn : styles.modeText}>{mode === 'BENEFICIARY' ? 'Beneficiario' : 'Cuenta propia'}</Text>
          </Pressable>)}
      </View>
      <Text style={styles.label}>Destinatario</Text>
      {candidates.length === 0 ? <Text style={styles.hint}>No hay destinatarios válidos para este tipo.</Text>
        : candidates.map(target => <Pressable key={target.id} accessibilityRole="radio"
          accessibilityState={{ checked: form.targetId === target.id }}
          onPress={() => setForm(prev => ({ ...prev, targetId: target.id }))}
          style={[styles.choice, form.targetId === target.id && styles.selected]}>
          <Text style={styles.value}>{target.title}</Text>
        </Pressable>)}
      <Text style={styles.label}>Importe MXN</Text>
      <TextInput accessibilityLabel="Importe MXN" style={styles.input} keyboardType="decimal-pad"
        placeholder="150.25" value={form.amount} maxLength={20}
        onChangeText={value => setForm(prev => ({ ...prev, amount: value }))}/>
      <Text style={styles.label}>Concepto (máximo 140 caracteres)</Text>
      <TextInput accessibilityLabel="Concepto" style={styles.input} value={form.concept} maxLength={140}
        onChangeText={value => setForm(prev => ({ ...prev, concept: value }))}/>
      <Text style={styles.label}>Referencia (1 a 7 dígitos)</Text>
      <TextInput accessibilityLabel="Referencia" style={styles.input} value={form.reference} keyboardType="number-pad" maxLength={7}
        onChangeText={value => setForm(prev => ({ ...prev, reference: value }))}/>
      {!draftCheck.draft && form.amount.length > 0 ? <Text style={styles.warning}>{Object.values(draftCheck.errors).join(' ')}</Text> : null}
      <Action title="Revisar transferencia" disabled={busy || !!loadError || !draftCheck.draft}
        onPress={() => void run(() => manager.begin(form, accounts, beneficiaries, Crypto.randomUUID()))}/>
    </View> : null}

    {state.phase === 'review' && intent ? <View style={styles.panel}>
      <Text style={styles.step}>PASO 2 · REVISA ANTES DE ENVIAR</Text>
      <Row title="Origen" value={intent.sourceLabel}/>
      <Row title="Destino" value={intent.targetLabel}/>
      <Row title="Importe" value={formatMxnCents(intent.amountCents)}/>
      <Row title="Concepto" value={intent.request.concept}/>
      <Row title="Referencia" value={intent.request.reference}/>
      <Text style={styles.hint}>Confirma expresamente. El servidor aplica saldo, límite diario y OTP cuando corresponde.</Text>
      <Action title={busy ? 'Procesando…' : 'Confirmar transferencia'} disabled={busy} onPress={() => void run(() => manager.submit())}/>
      <Action secondary title="Editar datos" disabled={busy} onPress={() => void run(async () => {
        const previous = intent.request;
        const mode: TransferMode = 'beneficiaryId' in previous ? 'BENEFICIARY' : 'OWN_ACCOUNTS';
        const targetId = mode === 'BENEFICIARY' ? previous.beneficiaryId! : previous.destinationAccountId!;
        setForm({ mode, sourceAccountId: previous.sourceAccountId, targetId, amount: previous.amount,
          concept: previous.concept, reference: previous.reference });
        return manager.reset();
      })}/>
    </View> : null}

    {state.phase === 'unknown' && intent ? <View style={styles.panel}>
      <Text style={styles.step}>RESULTADO NO CONFIRMADO</Text>
      <Text style={styles.warning}>No crees una transferencia nueva: la operación anterior podría haberse aplicado.</Text>
      <Row title="Importe" value={formatMxnCents(intent.amountCents)}/>
      <Row title="Destino" value={intent.targetLabel}/>
      {intent.knownId ? <><Row title="Folio conocido" value={intent.knownId}/>
        <Action title="Consultar estado real" disabled={busy} onPress={() => void run(() => manager.reconcile())}/></>
        : <Action title="Reintentar misma intención" disabled={busy} onPress={() => void run(() => manager.submit())}/>}
      <Text style={styles.hint}>Se conserva la llave idempotente y el payload original, incluso si cierras la app. La API decide si existe un débito.</Text>
    </View> : null}

    {state.phase === 'otp' && intent ? <View style={styles.panel}>
      <Text style={styles.step}>PASO 3 · AUTORIZACIÓN OTP</Text>
      <Text style={styles.hint}>La intención está pendiente. Todavía no se ha completado el débito.</Text>
      <Row title="Importe" value={formatMxnCents(intent.amountCents)}/>
      <Row title="Folio" value={intent.knownId ?? ''}/>
      <Text style={styles.label}>Código OTP de 6 dígitos</Text>
      <TextInput accessibilityLabel="Código OTP" style={styles.input} secureTextEntry keyboardType="number-pad"
        value={otp} maxLength={6} onChangeText={value => setOtp(value.replace(/[^0-9]/g, ''))}/>
      <Action title="Confirmar OTP" disabled={busy || !/^[0-9]{6}$/.test(otp)} onPress={() => {
        const value = otp; setOtp(''); void run(() => manager.confirm(value));
      }}/>
      <Action secondary title="Actualizar estado" disabled={busy} onPress={() => void run(() => manager.reconcile())}/>
      <Text style={styles.hint}>Usa únicamente el OTP de demostración configurado localmente. No guardamos ni registramos este código.</Text>
    </View> : null}

    {(state.phase === 'completed' || state.phase === 'rejected') && transfer && intent ? <View style={styles.panel}>
      <Text style={styles.step}>{state.phase === 'completed' ? 'COMPROBANTE · COMPLETADA' : 'OPERACIÓN RECHAZADA'}</Text>
      <Row title="Estado verificado" value={transfer.status}/>
      <Row title="Folio" value={transfer.id}/>
      <Row title="Origen" value={intent.sourceLabel}/>
      <Row title="Destino" value={transfer.destinationAccountMasked}/>
      <Row title="Importe" value={formatMxnCents(transfer.amountCents)}/>
      <Row title="Concepto" value={transfer.concept}/>
      <Row title="Referencia" value={transfer.reference}/>
      <Row title="Creación" value={movementDateInMexico(transfer.createdAt)}/>
      {transfer.completedAt ? <Row title="Completada" value={movementDateInMexico(transfer.completedAt)}/> : null}
      {transfer.status === 'REJECTED' ? <Text style={styles.error}>Motivo: {transfer.rejectionCode ?? 'No disponible'}. Esto NO es un comprobante de éxito.</Text> : null}
      <Action secondary title="Actualizar estado" disabled={busy} onPress={() => void run(() => manager.reconcile())}/>
      <Action title="Nueva transferencia" disabled={busy} onPress={() => { setOtp(''); void run(() => manager.reset()); }}/>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingBottom: 16 },
  heading: { color: '#183a49', fontWeight: '800', fontSize: 21, marginTop: 13 },
  panel: { backgroundColor: '#fff', borderRadius: 14, padding: 18, gap: 12 },
  step: { color: '#087e79', fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
  hint: { color: '#566f7a', fontSize: 13, lineHeight: 19 },
  warning: { color: '#975f07', fontWeight: '700', lineHeight: 20 },
  error: { color: '#b42318', fontWeight: '700', lineHeight: 20 },
  label: { color: '#46616f', fontSize: 13, fontWeight: '700' },
  value: { color: '#153744', fontSize: 14, flexShrink: 1 },
  row: { gap: 3, borderBottomWidth: 1, borderBottomColor: '#e9eeee', paddingBottom: 9 },
  choice: { borderColor: '#dce6e9', borderWidth: 1, padding: 13, borderRadius: 11 },
  selected: { borderColor: '#087e79', backgroundColor: '#e3f4f1' },
  switches: { flexDirection: 'row', gap: 6 },
  mode: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 9, backgroundColor: '#e7eff0' },
  modeOn: { backgroundColor: '#087e79' },
  modeText: { color: '#27505f', fontSize: 12, fontWeight: '700' },
  modeTextOn: { color: '#fff', fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#bacfd5', borderRadius: 10, backgroundColor: '#fff', padding: 13, color: '#102b38', fontSize: 16 },
  action: { borderRadius: 11, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center' },
  primary: { backgroundColor: '#087e79' },
  secondary: { backgroundColor: '#e8f3f2', borderColor: '#087e79', borderWidth: 1 },
  disabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontWeight: '800' },
  secondaryText: { color: '#087e79' },
  notice: { backgroundColor: '#fff', padding: 12, gap: 10, borderRadius: 12 },
});
