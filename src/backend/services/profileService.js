import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { getDemoAccounts } from '../auth/mockAuth';
import { logError, logInfo } from '../observability/logger';

function mapMockAccountToProfile(account) {
  if (!account) {
    return null;
  }

  return {
    id: account.id,
    email: account.email,
    username: account.username,
    displayName: account.displayName,
    bio: account.bio || '',
    avatarUrl: account.avatar || '',
    city: account.city || '',
    createdAt: account.createdAt || null,
    updatedAt: account.updatedAt || account.createdAt || null,
    source: 'mock',
  };
}

function mapSupabaseProfile(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    city: row.city,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'supabase',
  };
}

function buildDefaultSupabaseProfilePayload(userId, currentUser, authUser) {
  const email = currentUser?.email || authUser?.email || '';
  const emailPrefix = email.includes('@') ? email.split('@')[0] : 'user';
  const rawUsername =
    currentUser?.username ||
    authUser?.user_metadata?.username ||
    emailPrefix;
  const safeBase = String(rawUsername).toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  const suffix = String(userId || '').replace(/-/g, '').slice(0, 6) || '000000';
  const username = `${safeBase}_${suffix}`;
  const displayName =
    currentUser?.displayName ||
    authUser?.user_metadata?.displayName ||
    authUser?.user_metadata?.full_name ||
    username;

  return {
    id: userId,
    email,
    username,
    display_name: displayName,
    bio: '',
    avatar_url: '',
    city: authUser?.user_metadata?.city || '',
  };
}

async function getSupabaseAuthUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

async function resolveSupabaseUserId(currentUser) {
  if (currentUser?.id) {
    return currentUser.id;
  }

  const client = getSupabaseClient();
  const authUser = await getSupabaseAuthUser(client);
  if (!authUser) {
    return null;
  }

  return authUser.id;
}

export async function getCurrentProfile(currentUser) {
  const config = getBackendConfig();
  const startedAt = Date.now();

  try {

  if (config.provider === 'supabase' && canUseSupabase()) {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      return null;
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('profiles')
      .select('id, email, username, display_name, bio, avatar_url, city, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const authUser = await getSupabaseAuthUser(client);
      const payload = buildDefaultSupabaseProfilePayload(userId, currentUser, authUser);
      const { data: created, error: createError } = await client
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id, email, username, display_name, bio, avatar_url, city, created_at, updated_at')
        .single();

      if (createError) {
        throw createError;
      }

      const profile = mapSupabaseProfile(created);
      logInfo('profile.get.completed', {
        mode: 'supabase',
        createdOnDemand: true,
        durationMs: Date.now() - startedAt,
      });
      return profile;
    }

    const profile = mapSupabaseProfile(data);
    logInfo('profile.get.completed', {
      mode: 'supabase',
      createdOnDemand: false,
      durationMs: Date.now() - startedAt,
    });
    return profile;
  }

  if (!currentUser?.id) {
    return null;
  }

  const account = getDemoAccounts().find((item) => item.id === currentUser.id);
  const profile = mapMockAccountToProfile(account);
  logInfo('profile.get.completed', {
    mode: 'mock',
    found: Boolean(profile),
    durationMs: Date.now() - startedAt,
  });
  return profile;
  } catch (error) {
    logError('profile.get.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function updateCurrentProfile(currentUser, profileInput) {
  const config = getBackendConfig();
  const startedAt = Date.now();

  logInfo('profile.update.requested', {
    mode: config.provider,
    hasCurrentUser: Boolean(currentUser?.id),
    hasDisplayName: Boolean(String(profileInput?.displayName || '').trim()),
    hasUsername: Boolean(String(profileInput?.username || '').trim()),
  });

  try {

  if (config.provider === 'supabase' && canUseSupabase()) {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for profile update.');
    }

    const payload = {
      id: userId,
      email: currentUser?.email || profileInput.email || '',
      username: profileInput.username,
      display_name: profileInput.displayName,
      bio: profileInput.bio || '',
      avatar_url: profileInput.avatarUrl || '',
      city: profileInput.city || '',
    };

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, email, username, display_name, bio, avatar_url, city, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505' && String(error.message || '').toLowerCase().includes('display_name')) {
        throw new Error('This display name is already taken. Please choose another one.');
      }

      throw error;
    }

    const profile = mapSupabaseProfile(data);
    logInfo('profile.update.completed', {
      mode: 'supabase',
      durationMs: Date.now() - startedAt,
    });
    return profile;
  }

  const profile = {
    id: currentUser?.id || 'mock-user',
    email: currentUser?.email || profileInput.email || '',
    username: profileInput.username,
    displayName: profileInput.displayName,
    bio: profileInput.bio || '',
    avatarUrl: profileInput.avatarUrl || '',
    city: profileInput.city || '',
    createdAt: currentUser?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'mock',
  };

  logInfo('profile.update.completed', {
    mode: 'mock',
    durationMs: Date.now() - startedAt,
  });

  return profile;
  } catch (error) {
    logError('profile.update.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
