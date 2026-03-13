import { createClient } from '@supabase/supabase-js';
import { getBackendConfig, getMissingBackendEnvKeys } from '../config/env';

let cachedClient = null;

export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getBackendConfig();

  if (config.provider !== 'supabase') {
    return null;
  }

  const missingKeys = getMissingBackendEnvKeys();
  if (missingKeys.length > 0) {
    throw new Error(
      `Missing backend env keys for Supabase: ${missingKeys.join(', ')}`
    );
  }

  cachedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}
