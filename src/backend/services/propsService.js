import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { feedItems } from '../../data/mockFeed';
import { logError, logInfo } from '../observability/logger';
import { getVouchesForProps } from './vouchService';

const TAG_SEPARATOR = '||';

const mockPropsEntries = [];

for (const item of feedItems) {
  for (const prop of item.collectedProps || []) {
    mockPropsEntries.push({
      id: `mock-${item.id}-${mockPropsEntries.length + 1}`,
      fromUserId: `mock-friend-${item.id}`,
      toUserId: 'mock-user',
      content: prop,
      tags: [],
      createdAt: new Date().toISOString(),
      source: 'mock',
    });
  }
}

function normalizeTags(inputTags) {
  if (!Array.isArray(inputTags)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const item of inputTags) {
    const value = String(item || '').trim().toLowerCase();
    if (!value) {
      continue;
    }

    const safeValue = value.replace(new RegExp(`\\${TAG_SEPARATOR}`, 'g'), ' ');
    if (seen.has(safeValue)) {
      continue;
    }

    seen.add(safeValue);
    normalized.push(safeValue);
  }

  return normalized;
}

function serializeTags(tags) {
  if (!tags.length) {
    return null;
  }

  return tags.join(TAG_SEPARATOR);
}

function deserializeTags(categoryValue) {
  if (!categoryValue) {
    return [];
  }

  return String(categoryValue)
    .split(TAG_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapPropsEntry(row, vouchData) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    content: row.content || '',
    tags: deserializeTags(row.category),
    createdAt: row.created_at,
    vouchCount: vouchData?.count ?? 0,
    hasVouched: vouchData?.hasVouched ?? false,
    source: 'supabase',
  };
}

function mapMockPropsEntry(row) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    content: row.content || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    groupId: row.groupId || null,
    createdAt: row.createdAt,
    source: 'mock',
  };
}

function resolveMockUserId(currentUser) {
  return currentUser?.id || 'mock-user';
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

function ensureSupabasePropsMode() {
  const config = getBackendConfig();
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    throw new Error('Props service is only available when Supabase mode is enabled.');
  }
}

async function listFriendIds(client, userId) {
  const { data, error } = await client
    .from('friendships')
    .select('user_one_id, user_two_id')
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`);

  if (error) {
    throw error;
  }

  const friendIds = new Set();
  for (const row of data || []) {
    if (row.user_one_id === userId && row.user_two_id) {
      friendIds.add(row.user_two_id);
    }

    if (row.user_two_id === userId && row.user_one_id) {
      friendIds.add(row.user_one_id);
    }
  }

  return [...friendIds];
}

function dedupePropsRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) {
      continue;
    }

    seen.add(row.id);
    deduped.push(row);
  }

  return deduped;
}

async function assertGroupMembership(client, groupId, userId) {
  const { data, error } = await client
    .from('group_memberships')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('You can only post group props as a group member.');
  }
}

async function assertGroupRecipientMembership(client, groupId, recipientUserId) {
  const { data, error } = await client
    .from('group_memberships')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', recipientUserId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('You can only give group props to a member of this group.');
  }
}

export async function createPropsEntry(currentUser, input) {
  const config = getBackendConfig();
  const startedAt = Date.now();
  const requestedGroupId = String(input?.groupId || '').trim() || null;

  logInfo('props.create.requested', {
    mode: config.provider,
    hasCurrentUser: Boolean(currentUser?.id),
    hasTargetUser: Boolean(String(input?.toUserId || '').trim()),
    hasContent: Boolean(String(input?.content || '').trim()),
    tagCount: Array.isArray(input?.tags) ? input.tags.length : 0,
    hasGroupId: Boolean(requestedGroupId),
  });

  try {
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    const fromUserId = resolveMockUserId(currentUser);
    const toUserId = String(input?.toUserId || '').trim() || 'mock-friend-1';
    const content = String(input?.content || '').trim();
    const tags = normalizeTags(input?.tags);

    const created = {
      id: `mock-created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromUserId,
      toUserId,
      content,
      tags,
      groupId: requestedGroupId,
      createdAt: new Date().toISOString(),
      source: 'mock',
    };

    mockPropsEntries.unshift(created);
    const mapped = mapMockPropsEntry(created);
    logInfo('props.create.completed', {
      mode: 'mock',
      durationMs: Date.now() - startedAt,
      tagCount: mapped.tags.length,
    });
    return mapped;
  }

  ensureSupabasePropsMode();

  const fromUserId = await resolveSupabaseUserId(currentUser);
  if (!fromUserId) {
    throw new Error('No authenticated Supabase user available for creating props.');
  }

  const toUserId = String(input?.toUserId || '').trim();
  const content = String(input?.content || '').trim();
  const tags = normalizeTags(input?.tags);
  const groupId = requestedGroupId;

  if (!toUserId) {
    throw new Error('toUserId is required.');
  }

  if (toUserId === fromUserId) {
    throw new Error('You cannot give props to yourself.');
  }

  const client = getSupabaseClient();

  if (groupId) {
    await assertGroupMembership(client, groupId, fromUserId);
    await assertGroupRecipientMembership(client, groupId, toUserId);
  } else {
    const friendIds = await listFriendIds(client, fromUserId);
    if (!friendIds.includes(toUserId)) {
      throw new Error('You can only give props to a friend.');
    }
  }

  const { data, error } = await client
    .from('props_entries')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      content,
      category: serializeTags(tags),
    })
    .select('id, from_user_id, to_user_id, content, category, created_at')
    .single();

  if (error) {
    throw error;
  }

  if (groupId) {
    const { error: linkError } = await client
      .from('group_props_links')
      .insert({
        group_id: groupId,
        prop_id: data.id,
        linked_by: fromUserId,
      })
      .select('id')
      .single();

    if (linkError) {
      throw linkError;
    }
  }

  const mapped = mapPropsEntry(data);
  logInfo('props.create.completed', {
    mode: 'supabase',
    durationMs: Date.now() - startedAt,
    tagCount: mapped?.tags?.length || 0,
    hasGroupId: Boolean(groupId),
  });
  return {
    ...mapped,
    groupId,
  };
  } catch (error) {
    logError('props.create.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function listPropsFeed(currentUser) {
  const config = getBackendConfig();
  const startedAt = Date.now();

  try {
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    const userId = resolveMockUserId(currentUser);
    const feed = mockPropsEntries
      .filter((item) => item.fromUserId === userId || item.toUserId === userId)
      .map(mapMockPropsEntry);

    logInfo('props.feed.loaded', {
      mode: 'mock',
      durationMs: Date.now() - startedAt,
      count: feed.length,
    });
    return feed;
  }

  ensureSupabasePropsMode();

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for loading props feed.');
  }

  const client = getSupabaseClient();
  const friendIds = await listFriendIds(client, userId);
  if (!friendIds.length) {
    return [];
  }

  const { data: sentRows, error: sentError } = await client
    .from('props_entries')
    .select('id, from_user_id, to_user_id, content, category, created_at')
    .eq('from_user_id', userId)
    .in('to_user_id', friendIds)
    .order('created_at', { ascending: false });

  if (sentError) {
    throw sentError;
  }

  const { data: receivedRows, error: receivedError } = await client
    .from('props_entries')
    .select('id, from_user_id, to_user_id, content, category, created_at')
    .eq('to_user_id', userId)
    .in('from_user_id', friendIds)
    .order('created_at', { ascending: false });

  if (receivedError) {
    throw receivedError;
  }

  const { data: mutualFriendRows, error: mutualFriendError } = await client
    .from('props_entries')
    .select('id, from_user_id, to_user_id, content, category, created_at')
    .in('from_user_id', friendIds)
    .in('to_user_id', friendIds)
    .order('created_at', { ascending: false });

  if (mutualFriendError) {
    throw mutualFriendError;
  }

  const combined = dedupePropsRows([
    ...(sentRows || []),
    ...(receivedRows || []),
    ...(mutualFriendRows || []),
  ]);
  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const propIds = combined.map((row) => row.id);
  const vouchMap = await getVouchesForProps(client, userId, propIds);

  const feed = combined.map((row) => mapPropsEntry(row, vouchMap[row.id]));
  logInfo('props.feed.loaded', {
    mode: 'supabase',
    durationMs: Date.now() - startedAt,
    count: feed.length,
  });
  return feed;
  } catch (error) {
    logError('props.feed.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function listProfileProps(currentUser, profileUserId) {
  const config = getBackendConfig();
  const startedAt = Date.now();

  try {
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    const viewerId = resolveMockUserId(currentUser);
    const targetUserId = String(profileUserId || viewerId).trim();

    const propsEntries = mockPropsEntries
      .filter((item) => item.toUserId === targetUserId)
      .map(mapMockPropsEntry);

    logInfo('props.profile.loaded', {
      mode: 'mock',
      durationMs: Date.now() - startedAt,
      count: propsEntries.length,
    });
    return propsEntries;
  }

  ensureSupabasePropsMode();

  const viewerId = await resolveSupabaseUserId(currentUser);
  if (!viewerId) {
    throw new Error('No authenticated Supabase user available for loading profile props.');
  }

  const targetUserId = String(profileUserId || viewerId).trim();
  if (!targetUserId) {
    throw new Error('profileUserId is invalid.');
  }

  const client = getSupabaseClient();
  const friendIds = await listFriendIds(client, targetUserId);
  if (!friendIds.length) {
    return [];
  }

  const { data, error } = await client
    .from('props_entries')
    .select('id, from_user_id, to_user_id, content, category, created_at')
    .eq('to_user_id', targetUserId)
    .in('from_user_id', friendIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const rows = data || [];
  const propIds = rows.map((row) => row.id);
  const vouchMap = await getVouchesForProps(client, viewerId, propIds);

  const propsEntries = rows.map((row) => mapPropsEntry(row, vouchMap[row.id]));
  logInfo('props.profile.loaded', {
    mode: 'supabase',
    durationMs: Date.now() - startedAt,
    count: propsEntries.length,
  });
  return propsEntries;
  } catch (error) {
    logError('props.profile.failed', error, {
      mode: config.provider,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
