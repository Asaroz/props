import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { getVouchesForProps } from './vouchService';

const mockGroups = [
  {
    id: 'mock-group-1',
    name: 'Builders Circle',
    description: 'Mock group for local screenflow.',
    coverImageUrl: null,
    createdBy: 'mock-user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invitePermission: 'owner_only',
  },
];

const mockMemberships = [
  {
    id: 'mock-membership-1',
    groupId: 'mock-group-1',
    userId: 'mock-user',
    role: 'owner',
    createdAt: new Date().toISOString(),
  },
];

const mockInvites = [];

function mapGroup(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    coverImageUrl: row.cover_image_url || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    invitePermission: row.invite_permission || 'owner_only',
    source: 'supabase',
  };
}

function mapMembership(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    source: 'supabase',
  };
}

function mapInvite(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    groupId: row.group_id,
    inviterId: row.inviter_id,
    inviteeId: row.invitee_id,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    expiresAt: row.expires_at,
    source: 'supabase',
  };
}

function mapPropsEntry(row, vouchData, groupId) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    content: row.content || '',
    createdAt: row.created_at,
    vouchCount: vouchData?.count ?? 0,
    hasVouched: vouchData?.hasVouched ?? false,
    groupId,
    source: 'supabase',
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

function isSupabaseEnabled() {
  const config = getBackendConfig();
  return config.provider === 'supabase' && canUseSupabase();
}

async function getProfilesMap(client, userIds) {
  const normalizedIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!normalizedIds.length) {
    return {};
  }

  const { data, error } = await client
    .from('profiles')
    .select('id, display_name, username')
    .in('id', normalizedIds);

  if (error) {
    throw error;
  }

  const map = {};
  for (const row of data || []) {
    map[row.id] = {
      id: row.id,
      displayName: row.display_name || '',
      username: row.username || '',
    };
  }

  return map;
}

export async function listGroupsForUser(currentUser) {
  if (!isSupabaseEnabled()) {
    const userId = resolveMockUserId(currentUser);
    const memberships = mockMemberships.filter((item) => item.userId === userId);
    return memberships.map((membership) => {
      const group = mockGroups.find((item) => item.id === membership.groupId);
      return {
        ...group,
        source: 'mock',
        memberCount: mockMemberships.filter((item) => item.groupId === membership.groupId).length,
        viewerRole: membership.role,
      };
    });
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for groups.');
  }

  const client = getSupabaseClient();

  const { data: membershipsData, error: membershipsError } = await client
    .from('group_memberships')
    .select('id, group_id, user_id, role, created_at')
    .eq('user_id', userId);

  if (membershipsError) {
    throw membershipsError;
  }

  const memberships = (membershipsData || []).map(mapMembership).filter(Boolean);
  const groupIds = memberships.map((item) => item.groupId);
  if (!groupIds.length) {
    return [];
  }

  const [groupsResult, memberCountsResult] = await Promise.all([
    client
      .from('groups')
      .select('id, name, description, cover_image_url, created_by, created_at, updated_at, invite_permission')
      .in('id', groupIds),
    client
      .from('group_memberships')
      .select('group_id')
      .in('group_id', groupIds),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }

  if (memberCountsResult.error) {
    throw memberCountsResult.error;
  }

  const countsByGroupId = {};
  for (const row of memberCountsResult.data || []) {
    if (!row.group_id) {
      continue;
    }

    countsByGroupId[row.group_id] = (countsByGroupId[row.group_id] || 0) + 1;
  }

  const roleByGroupId = {};
  for (const membership of memberships) {
    roleByGroupId[membership.groupId] = membership.role;
  }

  return (groupsResult.data || [])
    .map((row) => {
      const mapped = mapGroup(row);
      return {
        ...mapped,
        memberCount: countsByGroupId[mapped.id] || 0,
        viewerRole: roleByGroupId[mapped.id] || 'member',
      };
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export async function createGroup(currentUser, input) {
  const normalizedName = String(input?.name || '').trim();
  const normalizedDescription = String(input?.description || '').trim();

  if (!normalizedName) {
    throw new Error('Group name is required.');
  }

  if (!isSupabaseEnabled()) {
    const userId = resolveMockUserId(currentUser);
    const createdAt = new Date().toISOString();
    const created = {
      id: `mock-group-${Date.now()}`,
      name: normalizedName,
      description: normalizedDescription,
      coverImageUrl: null,
      createdBy: userId,
      createdAt,
      updatedAt: createdAt,
      invitePermission: 'owner_only',
      source: 'mock',
    };

    mockGroups.unshift(created);
    mockMemberships.push({
      id: `mock-membership-${Date.now()}`,
      groupId: created.id,
      userId,
      role: 'owner',
      createdAt,
    });

    return {
      ...created,
      memberCount: 1,
      viewerRole: 'owner',
    };
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for creating groups.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('groups')
    .insert({
      name: normalizedName,
      description: normalizedDescription,
      cover_image_url: null,
      created_by: userId,
    })
    .select('id, name, description, cover_image_url, created_by, created_at, updated_at, invite_permission')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...mapGroup(data),
    memberCount: 1,
    viewerRole: 'owner',
  };
}

export async function listIncomingGroupInvites(currentUser) {
  if (!isSupabaseEnabled()) {
    const userId = resolveMockUserId(currentUser);
    return mockInvites
      .filter((item) => item.inviteeId === userId && item.status === 'pending')
      .map((item) => ({
        ...item,
        source: 'mock',
      }));
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for group invites.');
  }

  const client = getSupabaseClient();
  const { data: invitesData, error: invitesError } = await client
    .from('group_invites')
    .select('id, group_id, inviter_id, invitee_id, status, created_at, responded_at, expires_at')
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (invitesError) {
    throw invitesError;
  }

  const invites = (invitesData || []).map(mapInvite).filter(Boolean);
  if (!invites.length) {
    return [];
  }

  const groupIds = invites.map((item) => item.groupId);
  const inviterIds = invites.map((item) => item.inviterId);
  const [groupsResult, profilesMap] = await Promise.all([
    client
      .from('groups')
      .select('id, name, description, cover_image_url, created_by, created_at, updated_at, invite_permission')
      .in('id', groupIds),
    getProfilesMap(client, inviterIds),
  ]);

  if (groupsResult.error) {
    throw groupsResult.error;
  }

  const groupsMap = {};
  for (const row of groupsResult.data || []) {
    groupsMap[row.id] = mapGroup(row);
  }

  return invites.map((invite) => ({
    ...invite,
    group: groupsMap[invite.groupId] || null,
    inviterProfile: profilesMap[invite.inviterId] || null,
  }));
}

export async function respondToGroupInvite(currentUser, inviteId, action) {
  const normalizedInviteId = String(inviteId || '').trim();
  if (!normalizedInviteId) {
    throw new Error('inviteId is required.');
  }

  const normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction !== 'accept' && normalizedAction !== 'reject') {
    throw new Error("action must be either 'accept' or 'reject'.");
  }

  if (!isSupabaseEnabled()) {
    const userId = resolveMockUserId(currentUser);
    const match = mockInvites.find((item) => item.id === normalizedInviteId && item.inviteeId === userId);
    if (!match || match.status !== 'pending') {
      throw new Error('Invite was not found or already handled.');
    }

    match.status = normalizedAction === 'accept' ? 'accepted' : 'rejected';
    match.respondedAt = new Date().toISOString();
    return {
      ...match,
      source: 'mock',
    };
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for group invite response.');
  }

  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const targetStatus = normalizedAction === 'accept' ? 'accepted' : 'rejected';

  const { data, error } = await client
    .from('group_invites')
    .update({
      status: targetStatus,
      responded_at: nowIso,
    })
    .eq('id', normalizedInviteId)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .select('id, group_id, inviter_id, invitee_id, status, created_at, responded_at, expires_at');

  if (error) {
    throw error;
  }

  const row = (data || [])[0] || null;
  if (!row) {
    throw new Error('Invite was not found or already handled.');
  }

  return mapInvite(row);
}

export async function sendGroupInviteByDisplayName(currentUser, groupId, displayName) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    throw new Error('groupId is required.');
  }

  const normalizedDisplayName = String(displayName || '').trim();
  if (!normalizedDisplayName) {
    throw new Error('displayName is required.');
  }

  if (!isSupabaseEnabled()) {
    return {
      id: `mock-invite-${Date.now()}`,
      groupId: normalizedGroupId,
      status: 'pending',
      source: 'mock',
    };
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for sending group invites.');
  }

  const client = getSupabaseClient();
  const { data: profileData, error: profileError } = await client.rpc('find_profile_by_display_name', {
    input_display_name: normalizedDisplayName,
  });

  if (profileError) {
    throw new Error('Unable to send invite for this display name.');
  }

  const matches = Array.isArray(profileData) ? profileData : profileData ? [profileData] : [];
  if (matches.length > 1) {
    throw new Error('Unable to send invite for this display name.');
  }

  const match = matches[0] || null;
  if (!match?.id) {
    throw new Error('Unable to send invite for this display name.');
  }

  const { data, error } = await client
    .from('group_invites')
    .insert({
      group_id: normalizedGroupId,
      inviter_id: userId,
      invitee_id: match.id,
      status: 'pending',
    })
    .select('id, group_id, inviter_id, invitee_id, status, created_at, responded_at, expires_at')
    .single();

  if (error) {
    throw error;
  }

  return mapInvite(data);
}

export async function listGroupInvitesForGroup(currentUser, groupId) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    throw new Error('groupId is required.');
  }

  if (!isSupabaseEnabled()) {
    return mockInvites.filter((item) => item.groupId === normalizedGroupId && item.status === 'pending');
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for group invite listing.');
  }

  const client = getSupabaseClient();
  const { data: invitesData, error: invitesError } = await client
    .from('group_invites')
    .select('id, group_id, inviter_id, invitee_id, status, created_at, responded_at, expires_at')
    .eq('group_id', normalizedGroupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (invitesError) {
    throw invitesError;
  }

  const invites = (invitesData || []).map(mapInvite).filter(Boolean);
  const profilesMap = await getProfilesMap(
    client,
    invites.flatMap((item) => [item.inviterId, item.inviteeId])
  );

  return invites.map((invite) => ({
    ...invite,
    inviterProfile: profilesMap[invite.inviterId] || null,
    inviteeProfile: profilesMap[invite.inviteeId] || null,
  }));
}

export async function listGroupMemberProfiles(currentUser, groupId) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    throw new Error('groupId is required.');
  }

  if (!isSupabaseEnabled()) {
    return mockMemberships
      .filter((item) => item.groupId === normalizedGroupId)
      .map((item) => ({
        id: item.userId,
        displayName: item.userId,
        username: item.userId,
        role: item.role,
        source: 'mock',
      }));
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for group member listing.');
  }

  const client = getSupabaseClient();

  const { data: viewerMembership, error: viewerMembershipError } = await client
    .from('group_memberships')
    .select('group_id')
    .eq('group_id', normalizedGroupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (viewerMembershipError) {
    throw viewerMembershipError;
  }

  if (!viewerMembership) {
    throw new Error('You are not a member of this group.');
  }

  const { data: membershipsData, error: membershipsError } = await client
    .from('group_memberships')
    .select('user_id, role')
    .eq('group_id', normalizedGroupId)
    .order('created_at', { ascending: true });

  if (membershipsError) {
    throw membershipsError;
  }

  const roleByUserId = {};
  const memberUserIds = [];
  for (const row of membershipsData || []) {
    if (!row?.user_id) {
      continue;
    }

    roleByUserId[row.user_id] = row.role || 'member';
    memberUserIds.push(row.user_id);
  }

  const profilesMap = await getProfilesMap(client, memberUserIds);

  return memberUserIds.map((memberId) => ({
    id: memberId,
    displayName: profilesMap[memberId]?.displayName || '',
    username: profilesMap[memberId]?.username || '',
    role: roleByUserId[memberId] || 'member',
    source: 'supabase',
  }));
}

export async function getGroupDetail(currentUser, groupId) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) {
    throw new Error('groupId is required.');
  }

  if (!isSupabaseEnabled()) {
    const userId = resolveMockUserId(currentUser);
    const group = mockGroups.find((item) => item.id === normalizedGroupId) || null;
    if (!group) {
      throw new Error('Group not found.');
    }

    const members = mockMemberships
      .filter((item) => item.groupId === normalizedGroupId)
      .map((item) => ({
        ...item,
        profile: {
          id: item.userId,
          displayName: item.userId === userId ? 'You' : item.userId,
          username: item.userId,
        },
      }));

    const viewerMembership = members.find((item) => item.userId === userId) || null;

    return {
      group: {
        ...group,
        source: 'mock',
        memberCount: members.length,
      },
      members,
      feed: [],
      viewerRole: viewerMembership?.role || 'member',
      isOwner: viewerMembership?.role === 'owner',
    };
  }

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for group detail.');
  }

  const client = getSupabaseClient();
  const { data: groupData, error: groupError } = await client
    .from('groups')
    .select('id, name, description, cover_image_url, created_by, created_at, updated_at, invite_permission')
    .eq('id', normalizedGroupId)
    .maybeSingle();

  if (groupError) {
    throw groupError;
  }

  if (!groupData) {
    throw new Error('Group not found or not visible for your account.');
  }

  const { data: membershipsData, error: membershipsError } = await client
    .from('group_memberships')
    .select('id, group_id, user_id, role, created_at')
    .eq('group_id', normalizedGroupId)
    .order('created_at', { ascending: true });

  if (membershipsError) {
    throw membershipsError;
  }

  const memberships = (membershipsData || []).map(mapMembership).filter(Boolean);
  const profilesMap = await getProfilesMap(
    client,
    memberships.map((item) => item.userId)
  );

  const members = memberships.map((item) => ({
    ...item,
    profile: profilesMap[item.userId] || null,
  }));

  const viewerMembership = memberships.find((item) => item.userId === userId) || null;

  const { data: linksData, error: linksError } = await client
    .from('group_props_links')
    .select('prop_id, created_at')
    .eq('group_id', normalizedGroupId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (linksError) {
    throw linksError;
  }

  const propIds = (linksData || []).map((row) => row.prop_id).filter(Boolean);

  let feed = [];
  if (propIds.length) {
    const { data: propsData, error: propsError } = await client
      .from('props_entries')
      .select('id, from_user_id, to_user_id, content, created_at')
      .in('id', propIds);

    if (propsError) {
      throw propsError;
    }

    const vouchesMap = await getVouchesForProps(client, userId, propIds);
    const userProfilesMap = await getProfilesMap(
      client,
      (propsData || []).flatMap((item) => [item.from_user_id, item.to_user_id])
    );
    const orderMap = {};
    for (let index = 0; index < propIds.length; index += 1) {
      orderMap[propIds[index]] = index;
    }

    feed = (propsData || [])
      .map((row) => {
        const mapped = mapPropsEntry(row, vouchesMap[row.id], normalizedGroupId);
        return {
          ...mapped,
          fromProfile: userProfilesMap[mapped.fromUserId] || null,
          toProfile: userProfilesMap[mapped.toUserId] || null,
        };
      })
      .sort((a, b) => (orderMap[a.id] ?? 0) - (orderMap[b.id] ?? 0));
  }

  return {
    group: {
      ...mapGroup(groupData),
      memberCount: memberships.length,
    },
    members,
    feed,
    viewerRole: viewerMembership?.role || 'member',
    isOwner: viewerMembership?.role === 'owner',
  };
}