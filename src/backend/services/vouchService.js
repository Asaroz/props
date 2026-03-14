import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { logError, logInfo } from '../observability/logger';

function ensureSupabaseVouchMode() {
  const config = getBackendConfig();
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    throw new Error('Vouch service is only available when Supabase mode is enabled.');
  }
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

/**
 * Internal: batch-fetch vouch counts and viewer state for a list of prop IDs.
 * Returns a map: { [propId]: { count: number, hasVouched: boolean } }
 */
export async function getVouchesForProps(client, viewerUserId, propIds) {
  if (!propIds.length) {
    return {};
  }

  const { data, error } = await client
    .from('prop_vouches')
    .select('prop_id, user_id')
    .in('prop_id', propIds);

  if (error) {
    throw error;
  }

  const result = {};
  for (const propId of propIds) {
    result[propId] = { count: 0, hasVouched: false };
  }

  for (const row of data || []) {
    if (!result[row.prop_id]) {
      result[row.prop_id] = { count: 0, hasVouched: false };
    }

    result[row.prop_id].count += 1;
    if (row.user_id === viewerUserId) {
      result[row.prop_id].hasVouched = true;
    }
  }

  return result;
}

/**
 * Vouch for a props entry.
 * Service-layer friendship check provides a fast-fail before the DB trigger.
 */
export async function addVouch(currentUser, propId) {
  ensureSupabaseVouchMode();
  const startedAt = Date.now();

  logInfo('vouch.add.requested', {
    hasPropId: Boolean(propId),
    hasCurrentUser: Boolean(currentUser?.id),
  });

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for vouching.');
    }

    const normalizedPropId = String(propId || '').trim();
    if (!normalizedPropId) {
      throw new Error('propId is required.');
    }

    const client = getSupabaseClient();

    // Fast-fail: load the prop to check participant eligibility before hitting the trigger.
    const { data: propEntry, error: propError } = await client
      .from('props_entries')
      .select('id, from_user_id, to_user_id')
      .eq('id', normalizedPropId)
      .maybeSingle();

    if (propError) {
      throw propError;
    }

    if (!propEntry) {
      throw new Error('Props entry not found.');
    }

    if (propEntry.from_user_id === userId || propEntry.to_user_id === userId) {
      throw new Error('You cannot vouch for a prop you are directly involved in.');
    }

    const { data: inserted, error: insertError } = await client
      .from('prop_vouches')
      .insert({ prop_id: normalizedPropId, user_id: userId })
      .select('id, prop_id, user_id, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error('You have already vouched for this prop.');
      }

      throw insertError;
    }

    logInfo('vouch.add.completed', {
      durationMs: Date.now() - startedAt,
    });

    return {
      id: inserted.id,
      propId: inserted.prop_id,
      userId: inserted.user_id,
      createdAt: inserted.created_at,
    };
  } catch (error) {
    logError('vouch.add.failed', error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}

/**
 * Remove the current user's vouch from a props entry.
 * Returns true if a row was deleted, false if no vouch existed.
 */
export async function removeVouch(currentUser, propId) {
  ensureSupabaseVouchMode();
  const startedAt = Date.now();

  logInfo('vouch.remove.requested', {
    hasPropId: Boolean(propId),
    hasCurrentUser: Boolean(currentUser?.id),
  });

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for removing a vouch.');
    }

    const normalizedPropId = String(propId || '').trim();
    if (!normalizedPropId) {
      throw new Error('propId is required.');
    }

    const client = getSupabaseClient();

    const { error, count } = await client
      .from('prop_vouches')
      .delete({ count: 'exact' })
      .eq('prop_id', normalizedPropId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    logInfo('vouch.remove.completed', {
      removed: (count || 0) > 0,
      durationMs: Date.now() - startedAt,
    });

    return (count || 0) > 0;
  } catch (error) {
    logError('vouch.remove.failed', error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}
