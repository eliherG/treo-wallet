import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from './auth/SessionProvider';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { AppPrivacyCover } from './features/security/AppPrivacyCover';

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
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: '#f3f6f8' }}>
    <StatusBar style="dark" />
    <SessionProvider><Navigator /></SessionProvider>
    <AppPrivacyCover />
  </SafeAreaView></SafeAreaProvider>;
}

