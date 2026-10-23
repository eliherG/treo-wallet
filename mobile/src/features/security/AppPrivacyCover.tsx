import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { shouldCoverSensitiveContent } from '../transfers/privacy';

/** Expo Go best effort: this is not an OS-level screenshot/snapshot control. */
export function AppPrivacyCover() {
  const [covered, setCovered] = useState(() => shouldCoverSensitiveContent(AppState.currentState));
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      setCovered(shouldCoverSensitiveContent(state));
    });
    return () => listener.remove();
  }, []);
  if (!covered) return null;
  return <View testID="treo-privacy-cover" accessibilityLabel="Contenido oculto por privacidad" style={styles.cover}>
    <Text style={styles.label}>Treo Wallet · Contenido protegido</Text>
  </View>;
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, zIndex: 9999, backgroundColor: '#112f3a', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
