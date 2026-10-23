import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { loadAccounts, type Account } from '../features/accounts/accounts';
import { formatMxnCents, formatSignedMxnCents } from '../features/accounts/money';
import { loadRecentMovements, movementDateInMexico, type Movement } from '../features/movements/movements';
import { loadBeneficiaries, selectBeneficiary, type Beneficiary } from '../features/beneficiaries/beneficiaries';
import { TransferScreen } from './TransferScreen';

type LoadState<T> =
  | { kind: 'idle' | 'loading'; data: T }
  | { kind: 'success'; data: T }
  | { kind: 'error'; data: T; message: string };

type Section = 'overview' | 'beneficiaries' | 'transfer';

function Retry({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.retry}>
    <Text style={styles.retryText}>{label}</Text>
  </Pressable>;
}

function SectionStatus<T>({ state, label, onRetry }: { state: LoadState<T>; label: string; onRetry: () => void }) {
  if (state.kind === 'loading' || state.kind === 'idle') {
    return <View style={styles.status}><ActivityIndicator color="#087e79" /><Text>Cargando {label}…</Text></View>;
  }
  if (state.kind === 'error') {
    return <View style={styles.panel}>
      <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>
      <Retry label="Reintentar" onPress={onRetry} />
    </View>;
  }
  return null;
}

export function HomeScreen() {
  const { user, logout, authorizedGet } = useSession();
  const mounted = useRef(true);
  const [section, setSection] = useState<Section>('overview');
  const [accounts, setAccounts] = useState<LoadState<Account[]>>({ kind: 'idle', data: [] });
  const [movements, setMovements] = useState<LoadState<Movement[]>>({ kind: 'idle', data: [] });
  const [beneficiaries, setBeneficiaries] = useState<LoadState<Beneficiary[]>>({ kind: 'idle', data: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setAccounts({ kind: 'loading', data: [] });
    try {
      const data = await loadAccounts(authorizedGet);
      if (mounted.current) setAccounts({ kind: 'success', data });
    } catch {
      if (mounted.current) setAccounts({ kind: 'error', data: [], message: 'No pudimos consultar tus cuentas.' });
    }
  }, [authorizedGet]);

  const fetchMovements = useCallback(async () => {
    setMovements({ kind: 'loading', data: [] });
    try {
      const data = await loadRecentMovements(authorizedGet);
      if (mounted.current) setMovements({ kind: 'success', data });
    } catch {
      if (mounted.current) setMovements({ kind: 'error', data: [], message: 'No pudimos consultar tus movimientos.' });
    }
  }, [authorizedGet]);

  const fetchBeneficiaries = useCallback(async () => {
    setBeneficiaries({ kind: 'loading', data: [] });
    try {
      const data = await loadBeneficiaries(authorizedGet);
      if (mounted.current) setBeneficiaries({ kind: 'success', data });
    } catch {
      if (mounted.current) setBeneficiaries({ kind: 'error', data: [], message: 'No pudimos consultar tus beneficiarios.' });
    }
  }, [authorizedGet]);

  useEffect(() => {
    mounted.current = true;
    void fetchAccounts();
    void fetchMovements();
    return () => { mounted.current = false; };
  }, [fetchAccounts, fetchMovements]);

  useEffect(() => {
    if (section === 'beneficiaries' && beneficiaries.kind === 'idle') void fetchBeneficiaries();
  }, [section, beneficiaries.kind, fetchBeneficiaries]);

  async function endSession() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try { await logout(); }
    catch (reason) { if (mounted.current) setLogoutError(reason instanceof Error ? reason.message : 'No fue posible cerrar sesión.'); }
    finally { if (mounted.current) setLoggingOut(false); }
  }

  const selected = beneficiaries.kind === 'success' && selectedId
    ? selectBeneficiary(beneficiaries.data, selectedId) : null;

  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <Text style={styles.brand}>T / TREO WALLET</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión"
        accessibilityState={{ disabled: loggingOut }} disabled={loggingOut}
        onPress={() => void endSession()} style={styles.logout}>
        {loggingOut ? <ActivityIndicator color="#087e79" /> : <Text style={styles.logoutText}>Salir</Text>}
      </Pressable>
    </View>
    <Text accessibilityRole="header" style={styles.title}>Hola, {user?.name ?? 'usuario'}</Text>
    <Text style={styles.subtitle}>{user?.email}</Text>
    {logoutError ? <Text accessibilityRole="alert" style={styles.error}>{logoutError}</Text> : null}

    <View style={styles.tabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'overview' }}
        onPress={() => { setSection('overview'); void fetchAccounts(); void fetchMovements(); }}
        style={[styles.tab, section === 'overview' && styles.tabActive]}>
        <Text style={[styles.tabText, section === 'overview' && styles.tabTextActive]}>Inicio</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'beneficiaries' }}
        onPress={() => setSection('beneficiaries')}
        style={[styles.tab, section === 'beneficiaries' && styles.tabActive]}>
        <Text style={[styles.tabText, section === 'beneficiaries' && styles.tabTextActive]}>Beneficiarios</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'transfer' }}
        onPress={() => setSection('transfer')}
        style={[styles.tab, section === 'transfer' && styles.tabActive]}>
        <Text style={[styles.tabText, section === 'transfer' && styles.tabTextActive]}>Transferir</Text>
      </Pressable>
    </View>

    {section === 'overview' ? <>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Mis cuentas</Text>
        <Retry label="Actualizar" onPress={() => { void fetchAccounts(); void fetchMovements(); }} />
      </View>
      <SectionStatus state={accounts} label="cuentas" onRetry={() => void fetchAccounts()} />
      {accounts.kind === 'success' && (accounts.data.length === 0
        ? <Text style={styles.empty}>Todavía no tienes cuentas asociadas.</Text>
        : accounts.data.map(account => <View style={styles.accountCard} key={account.id}>
          <View style={styles.accountTop}>
            <Text style={styles.accountLabel}>Cuenta en pesos · MXN</Text>
            <Text style={account.status === 'ACTIVE' ? styles.active : styles.blocked}>
              {account.status === 'ACTIVE' ? 'Activa' : 'Bloqueada'}
            </Text>
          </View>
          <Text style={styles.balance}>{formatMxnCents(account.balanceCents)}</Text>
          <Text style={styles.meta}>CLABE {account.clabeMasked}</Text>
        </View>))}

      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Últimos 20 movimientos</Text>
      </View>
      <SectionStatus state={movements} label="movimientos" onRetry={() => void fetchMovements()} />
      {movements.kind === 'success' && (movements.data.length === 0
        ? <Text style={styles.empty}>Aún no tienes movimientos.</Text>
        : movements.data.map(item => <View style={styles.movementCard} key={item.id}>
          <View style={styles.movementRow}>
            <Text style={styles.movementType}>{item.type === 'DEBIT' ? 'Cargo' : 'Abono'}</Text>
            <Text style={item.type === 'DEBIT' ? styles.debit : styles.credit}>
              {formatSignedMxnCents(item.signedAmountCents)}
            </Text>
          </View>
          <Text style={styles.movementConcept}>{item.concept}</Text>
          <Text style={styles.meta}>{movementDateInMexico(item.createdAt)} · Ref. {item.reference}</Text>
          <Text style={styles.meta}>Cuenta {accounts.data.find(a => a.id === item.accountId)?.clabeMasked ?? 'propia'}</Text>
        </View>))}
      <Text style={styles.footnote}>Los saldos provienen de la API. No se calculan a partir de los movimientos.</Text>
    </> : section === 'beneficiaries' ? <>
      <View style={styles.sectionHeading}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Tus beneficiarios</Text>
        <Retry label="Actualizar" onPress={() => void fetchBeneficiaries()} />
      </View>
      <Text style={styles.hint}>Selecciona un beneficiario guardado previamente desde la aplicación web.</Text>
      <SectionStatus state={beneficiaries} label="beneficiarios" onRetry={() => void fetchBeneficiaries()} />
      {beneficiaries.kind === 'success' && (beneficiaries.data.length === 0
        ? <Text style={styles.empty}>Todavía no tienes beneficiarios guardados. Puedes agregarlos desde la web.</Text>
        : beneficiaries.data.map(item => <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`Seleccionar beneficiario ${item.alias}`}
            accessibilityState={{ selected: selectedId === item.id }}
            onPress={() => setSelectedId(item.id)}
            style={[styles.beneficiaryCard, selectedId === item.id && styles.beneficiarySelected]}>
            <View style={styles.movementRow}>
              <Text style={styles.beneficiaryAlias}>{item.alias}</Text>
              <Text style={styles.kind}>{item.isInternal ? 'Interno' : 'Externo'}</Text>
            </View>
            <Text style={styles.beneficiaryName}>{item.name}</Text>
            <Text style={styles.meta}>CLABE {item.clabeMasked}</Text>
            {selectedId === item.id ? <Text style={styles.selectedLabel}>✓ Seleccionado</Text> : null}
          </Pressable>))}
      {selected ? <View style={styles.selectedPanel}>
        <Text style={styles.selectedTitle}>Destinatario seleccionado: {selected.alias}</Text>
        <Text style={styles.meta}>{selected.isInternal
          ? 'Utiliza la pestaña Transferir para enviar a este beneficiario interno.'
          : 'Beneficiario externo: las transferencias externas no están habilitadas en este MVP.'}</Text>
      </View> : null}
      <Text style={styles.footnote}>La selección se realiza sobre los datos propios devueltos por la API. La autorización se comprobará nuevamente en el servidor al transferir.</Text>
    </> : <TransferScreen />}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f6f8' },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 48, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#087e79', fontSize: 16, fontWeight: '800' },
  logout: { paddingVertical: 8, paddingHorizontal: 14, borderColor: '#087e79', borderWidth: 1, borderRadius: 10 },
  logoutText: { color: '#087e79', fontWeight: '700' },
  title: { color: '#102b38', fontSize: 28, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#536e7b', fontSize: 13 },
  tabs: { backgroundColor: '#e7eff0', borderRadius: 14, flexDirection: 'row', padding: 4, marginTop: 16 },
  tab: { flex: 1, padding: 12, borderRadius: 11, alignItems: 'center' },
  tabActive: { backgroundColor: '#087e79' },
  tabText: { color: '#27505f', fontWeight: '700' },
  tabTextActive: { color: '#ffffff' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 },
  sectionTitle: { flexShrink: 1, color: '#183a49', fontSize: 20, fontWeight: '800' },
  retry: { paddingVertical: 8, paddingHorizontal: 10 },
  retryText: { color: '#087e79', fontWeight: '700', fontSize: 13 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  error: { color: '#b42318', fontWeight: '600' },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 18 },
  empty: { backgroundColor: '#ffffff', borderRadius: 14, color: '#536e7b', padding: 18, lineHeight: 22 },
  accountCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, gap: 9 },
  accountTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accountLabel: { color: '#486577', fontSize: 13, fontWeight: '600' },
  active: { color: '#087e79', fontSize: 12, fontWeight: '800' },
  blocked: { color: '#b42318', fontSize: 12, fontWeight: '800' },
  balance: { color: '#163744', fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  meta: { color: '#718592', fontSize: 12, marginTop: 2 },
  movementCard: { backgroundColor: '#ffffff', borderRadius: 13, padding: 16, gap: 5 },
  movementRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  movementType: { color: '#396475', fontWeight: '700', fontSize: 12 },
  debit: { color: '#b42318', fontWeight: '800', fontSize: 15 },
  credit: { color: '#087e79', fontWeight: '800', fontSize: 15 },
  movementConcept: { color: '#1a3746', fontSize: 15, fontWeight: '700' },
  footnote: { color: '#758c99', fontSize: 12, marginTop: 12, lineHeight: 19 },
  hint: { color: '#566f7a', lineHeight: 20 },
  beneficiaryCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 17, gap: 6, borderWidth: 2, borderColor: '#ffffff' },
  beneficiarySelected: { borderColor: '#087e79' },
  beneficiaryAlias: { color: '#193c4a', fontSize: 17, fontWeight: '800' },
  beneficiaryName: { color: '#446373', fontSize: 14 },
  kind: { color: '#087e79', fontWeight: '700', fontSize: 12 },
  selectedLabel: { color: '#087e79', fontWeight: '700', marginTop: 5 },
  selectedPanel: { backgroundColor: '#e3f4f1', borderRadius: 14, padding: 18, gap: 6 },
  selectedTitle: { color: '#13574f', fontWeight: '800' },
});
