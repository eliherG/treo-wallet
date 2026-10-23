import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './auth/SessionProvider';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { shouldCoverSensitiveContent } from './features/transfers/privacy';

const Stack = createNativeStackNavigator();

function Navigator() {
  const { user, ready } = useSession();
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator color="#087e79" /><Text>Comprobando sesión...</Text>
  </View>;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false }}>
    {user ? <Stack.Screen name="Home" component={HomeScreen} /> : <Stack.Screen name="Login" component={LoginScreen} />}
  </Stack.Navigator></NavigationContainer>;
}

export default function App() {
  const [covered, setCovered] = useState(shouldCoverSensitiveContent(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setCovered(shouldCoverSensitiveContent(state)));
    return () => subscription.remove();
  }, []);
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f3f6f8' }}>
    <StatusBar style="dark" />
    <SessionProvider><Navigator /></SessionProvider>
    {covered && <View accessibilityLabel="Contenido oculto por privacidad" style={styles.privacy}>
      <Text style={styles.privacyText}>Treo Wallet · Contenido protegido</Text>
    </View>}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  privacy: { ...StyleSheet.absoluteFill, zIndex: 9999, backgroundColor: '#112f3a', alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
