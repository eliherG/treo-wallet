import * as SecureStore from 'expo-secure-store';
import type { PendingIntent, PendingIntentStore } from './manager';

function storageKey(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('Identificador de usuario inválido.');
  return `treo.wallet.pending-transfer.v1.${ownerId}`;
}

/** No OTP, access token, or refresh token is written to pending-intent storage. */
export const securePendingIntentStore: PendingIntentStore = {
  read: async ownerId => {
    const raw = await SecureStore.getItemAsync(storageKey(ownerId));
    return raw ? JSON.parse(raw) as PendingIntent : null;
  },
  write: async (ownerId, intent) => {
    if (intent.ownerId !== ownerId) throw new Error('La intención pertenece a otra sesión.');
    await SecureStore.setItemAsync(storageKey(ownerId), JSON.stringify(intent));
  },
  remove: async ownerId => { await SecureStore.deleteItemAsync(storageKey(ownerId)); },
};
