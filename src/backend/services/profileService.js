import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { getDemoAccounts } from '../auth/mockAuth';

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

async function resolveSupabaseUserId(currentUser) {
  if (currentUser?.id) {
    return currentUser.id;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    return null;
  }

  return data.user.id;
}

export async function getCurrentProfile(currentUser) {
  const config = getBackendConfig();

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

    return mapSupabaseProfile(data);
  }

  if (!currentUser?.id) {
    return null;
  }

  const account = getDemoAccounts().find((item) => item.id === currentUser.id);
  return mapMockAccountToProfile(account);
}

export async function updateCurrentProfile(currentUser, profileInput) {
  const config = getBackendConfig();

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
      throw error;
    }

    return mapSupabaseProfile(data);
  }

  return {
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
}
