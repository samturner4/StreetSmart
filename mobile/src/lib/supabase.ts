import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Create custom storage implementation for React Native
const ExpoAsyncStorageAdapter = {
  getItem: (key: string) => {
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    return AsyncStorage.removeItem(key);
  },
};

const supabaseUrl = SUPABASE_URL || (Constants.expoConfig?.extra as any)?.SUPABASE_URL;
const supabaseAnon = SUPABASE_ANON_KEY || (Constants.expoConfig?.extra as any)?.SUPABASE_ANON_KEY;

console.log('[Supabase] URL:', supabaseUrl);
console.log('[Supabase] Anon Key:', supabaseAnon ? 'Present' : 'Missing');

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Supabase credentials are missing. Define SUPABASE_URL and SUPABASE_ANON_KEY in a .env file or in app.json extra.');
}

// Initialize Supabase client
export const supabase = createClient(
  supabaseUrl,
  supabaseAnon,
  {
    auth: {
      storage: ExpoAsyncStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Export types
export type { User, Session } from '@supabase/supabase-js';
