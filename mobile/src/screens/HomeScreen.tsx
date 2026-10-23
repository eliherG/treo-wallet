import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useSession } from '../auth/SessionProvider';

export function HomeScreen() {
  const { user, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function endSession() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await logout(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cerrar sesión.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.root}>
    <Text style={styles.brand}>TREO WALLET</Text>
    <Text accessibilityRole="header" style={styles.title}>Hola, {user?.name ?? 'usuario'}</Text>
    <Text style={styles.info}>{user?.email}</Text>
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Sesión móvil activa</Text>
      <Text style={styles.panelText}>El access token está únicamente en memoria. La sesión de renovación usa SecureStore.</Text>
      <Text style={styles.panelText}>Cuentas, movimientos y transferencias móviles llegan en T-27 y T-28.</Text>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" accessibilityState={{ disabled: busy }}
      disabled={busy} style={styles.button} onPress={() => void endSession()}>
      {busy ? <ActivityIndicator color="#087e79" /> : <Text style={styles.buttonText}>Cerrar sesión</Text>}
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f6f8', padding: 24, justifyContent: 'center', gap: 14 },
  brand: { color: '#087e79', fontWeight: '800', fontSize: 16 },
  title: { color: '#102b38', fontSize: 28, fontWeight: '800' },
  info: { color: '#526c79', fontSize: 14 },
  panel: { backgroundColor: 'white', padding: 22, borderRadius: 18, gap: 8, marginTop: 10 },
  panelTitle: { color: '#173444', fontSize: 19, fontWeight: '700' },
  panelText: { color: '#587480', lineHeight: 21 },
  error: { color: '#b42318' },
  button: { marginTop: 22, backgroundColor: 'white', borderWidth: 1, borderColor: '#087e79', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#087e79', fontWeight: '700' },
});
