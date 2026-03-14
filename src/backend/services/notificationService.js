import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { logError, logInfo } from '../observability/logger';

function mapNotification(row, actorProfilesMap = {}) {
  if (!row) {
    return null;
  }

  const actorProfile = actorProfilesMap[row.actor_id];
  const actorDisplayName =
    actorProfile?.display_name || actorProfile?.username || null;

  return {
    id: row.id,
    type: row.type,
    relatedId: row.related_id || null,
    actorId: row.actor_id || null,
    actorDisplayName,
    readAt: row.read_at || null,
    createdAt: row.created_at,
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

function ensureSupabaseNotificationMode() {
  const config = getBackendConfig();
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    throw new Error('Notification service is only available when Supabase mode is enabled.');
  }
}

export async function listNotifications(currentUser) {
  const startedAt = Date.now();
  ensureSupabaseNotificationMode();

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for loading notifications.');
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('notifications')
      .select('id, type, related_id, actor_id, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      throw error;
    }

    // Resolve actor display names via a separate profiles query.
    const actorIds = [...new Set((data || []).map((n) => n.actor_id).filter(Boolean))];
    let actorProfilesMap = {};

    if (actorIds.length > 0) {
      const { data: profiles } = await client
        .from('profiles')
        .select('id, display_name, username')
        .in('id', actorIds);

      for (const profile of profiles || []) {
        actorProfilesMap[profile.id] = profile;
      }
    }

    const mapped = (data || []).map((row) => mapNotification(row, actorProfilesMap));
    logInfo('notification.list.loaded', { count: mapped.length, durationMs: Date.now() - startedAt });
    return mapped;
  } catch (error) {
    logError('notification.list.failed', error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}

export async function markNotificationRead(currentUser, notificationId) {
  const startedAt = Date.now();
  ensureSupabaseNotificationMode();

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for marking notification as read.');
    }

    const client = getSupabaseClient();
    const normalizedNotificationId = String(notificationId || '').trim();
    if (!normalizedNotificationId) {
      throw new Error('notificationId is required.');
    }

    const { data, error } = await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', normalizedNotificationId)
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Notification not found, not owned by user, or already read.');
    }

    logInfo('notification.read.marked', { durationMs: Date.now() - startedAt });
  } catch (error) {
    logError('notification.read.failed', error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}

export async function markAllNotificationsRead(currentUser) {
  const startedAt = Date.now();
  ensureSupabaseNotificationMode();

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for marking all notifications as read.');
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id');

    if (error) {
      throw error;
    }

    const updatedCount = (data || []).length;
    logInfo('notification.read.all_marked', {
      updatedCount,
      durationMs: Date.now() - startedAt,
    });
    return { updatedCount };
  } catch (error) {
    logError('notification.read.all_failed', error, { durationMs: Date.now() - startedAt });
    throw error;
  }
}
