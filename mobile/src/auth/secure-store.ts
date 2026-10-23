import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from './types';

const KEY = 'treo.wallet.refresh.v1';

export const secureTokenStorage: TokenStorage = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (value) => SecureStore.setItemAsync(KEY, value),
  remove: () => SecureStore.deleteItemAsync(KEY),
};
