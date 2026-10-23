import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';

export function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (busy) return;
    if (!email.includes('@') || !password) { setError('Ingresa correo y contraseña válidos.'); return; }
    setBusy(true); setError(null);
    try { await login({ email: email.trim(), password }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No fue posible iniciar sesión.'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.card}>
      <Text style={styles.logo}>T  /  TREO WALLET</Text>
      <Text accessibilityRole="header" style={styles.title}>Tu billetera, a la mano.</Text>
      <Text style={styles.subtitle}>Inicia sesión con tu usuario de demostración.</Text>
      <Text style={styles.label}>Correo electrónico</Text>
      <TextInput accessibilityLabel="Correo electrónico" autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail}
        style={styles.input} placeholder="tu@correo.com" editable={!busy} />
      <Text style={styles.label}>Contraseña</Text>
      <TextInput accessibilityLabel="Contraseña" secureTextEntry autoComplete="password"
        value={password} onChangeText={setPassword} style={styles.input}
        editable={!busy} placeholder="Contraseña" />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Iniciar sesión" accessibilityState={{ disabled: busy }}
        disabled={busy} onPress={() => void submit()} style={styles.button}>
        {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Entrar a Treo</Text>}
      </Pressable>
      <Text style={styles.note}>Solo demostración. El token de renovación se almacena de forma segura en el dispositivo.</Text>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  outer: { flex: 1, justifyContent: 'center', backgroundColor: '#f3f6f8', padding: 24 },
  card: { backgroundColor: '#ffffff', padding: 24, borderRadius: 24, gap: 10 },
  logo: { color: '#087e79', fontSize: 16, fontWeight: '800', marginBottom: 20 },
  title: { fontSize: 28, color: '#102b38', fontWeight: '800' },
  subtitle: { fontSize: 14, color: '#5d737e', marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', color: '#203e4b' },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#b9c9d0', borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: '#102b38' },
  error: { color: '#b42318', marginTop: 6 },
  button: { backgroundColor: '#087e79', padding: 17, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 12, color: '#72828b', marginTop: 12 },
});
