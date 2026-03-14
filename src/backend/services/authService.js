import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { getDemoAccounts, loginWithCredentials } from '../auth/mockAuth';
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from '../auth/sessionStore';
import { logError, logInfo } from '../observability/logger';

function buildDefaultProfilePayload(user) {
  const email = user.email || '';
  const emailPrefix = email.includes('@') ? email.split('@')[0] : 'user';
  const rawUsername = user.user_metadata?.username || emailPrefix;
  const safeBase = String(rawUsername).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  const suffix = String(user.id || '').replace(/-/g, '').slice(0, 6) || '000000';
  const username = `${safeBase}_${suffix}`;
  const displayName = user.user_metadata?.displayName || user.user_metadata?.full_name || username;

  return {
    id: user.id,
    email,
    username,
    display_name: displayName,
    bio: '',
    avatar_url: '',
    city: user.user_metadata?.city || '',
  };
}

async function ensureSupabaseProfile(client, user) {
  const { data: existingProfile, error: lookupError } = await client
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existingProfile) {
    return;
  }

  const payload = buildDefaultProfilePayload(user);
  const { error } = await client.from('profiles').insert(payload);
  // Another request may create the row at the same time; that race is safe to ignore.
  if (error && error.code !== '23505') {
    throw error;
  }
}

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
  const normalized = identifier.trim();
  const startedAt = Date.now();

  logInfo('auth.login.requested', {
    mode: config.provider,
    usesEmail: normalized.includes('@'),
  });

  try {

  if (config.provider === 'supabase' && canUseSupabase()) {
    const isEmail = normalized.includes('@');

    if (!isEmail) {
      throw new Error('Please use your email address for Supabase login.');
    }

    const client = getSupabaseClient();

    const { data, error } = await client.auth.signInWithPassword({
      email: normalized,
      password,
    });

    if (error) {
      const normalizedErrorMessage = String(error.message || '').toLowerCase();
      if (
        normalizedErrorMessage.includes('invalid login credentials') ||
        normalizedErrorMessage.includes('email not confirmed')
      ) {
        throw new Error('Invalid email or password.');
      }

      throw new Error(error.message || 'Supabase login failed.');
    }

    if (!data?.user) {
      return null;
    }

    await ensureSupabaseProfile(client, data.user);

    const account = mapSupabaseAuthUser(data.user, normalized);
    await saveAuthSession({
      provider: 'supabase',
      account,
      session: data.session
        ? {
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          }
        : null,
    });
    logInfo('auth.login.completed', {
      mode: 'supabase',
      success: true,
      durationMs: Date.now() - startedAt,
    });
    return account;
  }

  const account = loginWithCredentials(identifier, password);
  if (account) {
    await saveAuthSession({
      provider: 'mock',
      account,
      session: null,
    });
  }

  logInfo('auth.login.completed', {
    mode: 'mock',
    success: Boolean(account),
    durationMs: Date.now() - startedAt,
  });

  return account;
  } catch (error) {
    logError('auth.login.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function signUpWithPassword({ email, password, username, displayName, city }) {
  const config = getBackendConfig();
  const startedAt = Date.now();

  logInfo('auth.signup.requested', {
    mode: config.provider,
  });

  try {

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
    await clearAuthSession();
    logInfo('auth.signup.completed', {
      mode: 'supabase',
      requiresEmailConfirmation: true,
      durationMs: Date.now() - startedAt,
    });
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
    if (
      profileError.code === '23505' &&
      String(profileError.message || '').toLowerCase().includes('display_name')
    ) {
      throw new Error('This display name is already taken. Please choose another one.');
    }

    throw profileError;
  }

  await saveAuthSession({
    provider: 'supabase',
    account,
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  });

  logInfo('auth.signup.completed', {
    mode: 'supabase',
    requiresEmailConfirmation: false,
    durationMs: Date.now() - startedAt,
  });

  return {
    ...account,
    requiresEmailConfirmation: false,
    profileCreated: true,
  };
  } catch (error) {
    logError('auth.signup.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function restoreAuthSession() {
  const stored = await loadAuthSession();
  if (!stored?.account) {
    return null;
  }

  const config = getBackendConfig();
  if (stored.provider === 'mock') {
    if (config.provider === 'mock') {
      return stored.account;
    }

    await clearAuthSession();
    return null;
  }

  if (config.provider === 'supabase' && canUseSupabase()) {
    const client = getSupabaseClient();
    if (!stored.session?.accessToken || !stored.session?.refreshToken) {
      await clearAuthSession();
      return null;
    }

    const { data, error } = await client.auth.setSession({
      access_token: stored.session.accessToken,
      refresh_token: stored.session.refreshToken,
    });

    if (error || !data?.user) {
      await clearAuthSession();
      return null;
    }

    await ensureSupabaseProfile(client, data.user);

    const restoredAccount = mapSupabaseAuthUser(data.user, data.user.email || '');
    await saveAuthSession({
      provider: 'supabase',
      account: restoredAccount,
      session: {
        accessToken: data.session?.access_token || stored.session.accessToken,
        refreshToken: data.session?.refresh_token || stored.session.refreshToken,
      },
    });
    return restoredAccount;
  }

  await clearAuthSession();
  return null;
}

export async function logoutCurrentUser() {
  const config = getBackendConfig();
  const startedAt = Date.now();
  if (config.provider === 'supabase' && canUseSupabase()) {
    const client = getSupabaseClient();
    await client.auth.signOut();
  }

  await clearAuthSession();
  logInfo('auth.logout.completed', {
    mode: config.provider,
    durationMs: Date.now() - startedAt,
  });
}

export function listDemoAccounts(limit = 3) {
  return getDemoAccounts().slice(0, limit);
}
