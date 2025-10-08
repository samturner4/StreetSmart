export interface EnvConfig {
  MAPBOX_TOKEN?: string;
  API_BASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

let cachedConfig: EnvConfig | null = null;

export function getConfig(readEnv: () => Partial<EnvConfig>): EnvConfig {
  if (cachedConfig) return cachedConfig;
  const base = readEnv();
  cachedConfig = {
    MAPBOX_TOKEN: base.MAPBOX_TOKEN,
    API_BASE_URL: base.API_BASE_URL,
    SUPABASE_URL: base.SUPABASE_URL,
    SUPABASE_ANON_KEY: base.SUPABASE_ANON_KEY,
  };
  return cachedConfig;
}
