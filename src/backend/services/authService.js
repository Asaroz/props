import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { getDemoAccounts, loginWithCredentials } from '../auth/mockAuth';

function mapSupabaseAuthUser(user, fallbackEmail) {
  return {
    id: user.id,
    email: user.email || fallbackEmail,
    username: user.user_metadata?.username || fallbackEmail,
    displayName:
      user.user_metadata?.displayName ||
      user.user_metadata?.full_name ||
      fallbackEmail,
    authProvider: 'supabase',
  };
}

export function getAuthServiceMode() {
  return canUseSupabase() ? 'supabase' : 'mock';
}

export async function loginWithPassword(identifier, password) {
  const config = getBackendConfig();

  if (config.provider === 'supabase' && canUseSupabase()) {
    const client = getSupabaseClient();
    const normalized = identifier.trim();
    const isEmail = normalized.includes('@');

    if (!isEmail) {
      throw new Error('Supabase login currently requires email as identifier.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (error || !data?.user) {
      return null;
    }

    return mapSupabaseAuthUser(data.user, normalized);
  }

  return loginWithCredentials(identifier, password);
}

export async function signUpWithPassword({ email, password, username, displayName, city }) {
  const config = getBackendConfig();

  if (config.provider !== 'supabase' || !canUseSupabase()) {
    throw new Error('Sign up is only available when Supabase mode is enabled.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedDisplayName = displayName.trim();

  if (!normalizedEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }

  if (!normalizedUsername) {
    throw new Error('Please choose a username.');
  }

  if (!normalizedDisplayName) {
    throw new Error('Please enter a display name.');
  }

  if (!password || password.length < 8) {
    throw new Error('Please use a password with at least 8 characters.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: config.authRedirectUrl || undefined,
      data: {
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        city: city?.trim() || '',
      },
    },
  });

  if (error || !data?.user) {
    throw error || new Error('Sign up failed.');
  }

  const account = mapSupabaseAuthUser(data.user, normalizedEmail);

  if (!data.session) {
    return {
      ...account,
      requiresEmailConfirmation: true,
      profileCreated: false,
    };
  }

  const { error: profileError } = await client.from('profiles').upsert(
    {
      id: data.user.id,
      email: normalizedEmail,
      username: normalizedUsername,
      display_name: normalizedDisplayName,
      bio: '',
      avatar_url: '',
      city: city?.trim() || '',
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    throw profileError;
  }

  return {
    ...account,
    requiresEmailConfirmation: false,
    profileCreated: true,
  };
}

export function listDemoAccounts(limit = 3) {
  return getDemoAccounts().slice(0, limit);
}
