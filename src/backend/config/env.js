const REQUIRED_BACKEND_ENV_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
];

export function getBackendConfig() {
  return {
    provider: process.env.EXPO_PUBLIC_BACKEND_PROVIDER || 'mock',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    authRedirectUrl: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || '',
  };
}

export function getMissingBackendEnvKeys() {
  const config = getBackendConfig();
  if (config.provider !== 'supabase') {
    return [];
  }

  return REQUIRED_BACKEND_ENV_KEYS.filter((key) => {
    if (key === 'EXPO_PUBLIC_SUPABASE_URL') {
      return !config.supabaseUrl;
    }

    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') {
      return !config.supabaseAnonKey;
    }

    return false;
  });
}

export function isSupabaseEnabled() {
  const config = getBackendConfig();
  return config.provider === 'supabase';
}

export function canUseSupabase() {
  return isSupabaseEnabled() && getMissingBackendEnvKeys().length === 0;
}
