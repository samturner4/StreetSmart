import { getConfig, type EnvConfig } from '@walksafe/shared/config';

export const webConfig: EnvConfig = getConfig(() => ({
  MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}));
