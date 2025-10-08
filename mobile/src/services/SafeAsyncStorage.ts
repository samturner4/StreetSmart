import { Platform } from 'react-native';

/**
 * Attempts to load the native `@react-native-async-storage/async-storage` module. If that fails (e.g. the
 * native module is missing in a development client) we fall back to an in-memory polyfill so the app
 * can still run. The in-memory store is obviously not persisted between reloads but avoids runtime
 * crashes during development.
 */
let Storage: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
  if (!NativeAsyncStorage || NativeAsyncStorage === null) {
    throw new Error('Native module missing');
  }
  Storage = NativeAsyncStorage;
} catch (err) {
  console.warn('[SafeAsyncStorage] Native AsyncStorage unavailable. Using in-memory fallback.', err);
  const memoryStore = new Map<string, string>();
  Storage = {
    async getItem(key: string): Promise<string | null> {
      return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
    },
    async setItem(key: string, value: string): Promise<void> {
      memoryStore.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      memoryStore.delete(key);
    },
    async clear(): Promise<void> {
      memoryStore.clear();
    },
  };
}

export default Storage;

