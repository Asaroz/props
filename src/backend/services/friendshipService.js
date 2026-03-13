import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';

function mapFriendRequest(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: 'supabase',
  };
}

function mapFriendship(row, currentUserId) {
  if (!row) {
    return null;
  }

  const friendUserId = row.user_one_id === currentUserId ? row.user_two_id : row.user_one_id;
  return {
    id: row.id,
    userOneId: row.user_one_id,
    userTwoId: row.user_two_id,
    friendUserId,
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

function ensureSupabaseFriendshipMode() {
  const config = getBackendConfig();
  if (config.provider !== 'supabase' || !canUseSupabase()) {
    throw new Error('Friendship service is only available when Supabase mode is enabled.');
  }
}

async function findExistingFriendship(client, userId, otherUserId) {
  const { data, error } = await client
    .from('friendships')
    .select('id, user_one_id, user_two_id, created_at')
    .or(
      `and(user_one_id.eq.${userId},user_two_id.eq.${otherUserId}),and(user_one_id.eq.${otherUserId},user_two_id.eq.${userId})`
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function sendFriendRequest(currentUser, receiverUserId) {
  ensureSupabaseFriendshipMode();

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for sending a friend request.');
  }

  const normalizedReceiverId = String(receiverUserId || '').trim();
  if (!normalizedReceiverId) {
    throw new Error('receiverUserId is required.');
  }

  if (normalizedReceiverId === userId) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const client = getSupabaseClient();

  const existingFriendship = await findExistingFriendship(client, userId, normalizedReceiverId);
  if (existingFriendship) {
    throw new Error('You are already friends with this user.');
  }

  const { data: existingSentRequest, error: existingSentRequestError } = await client
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .eq('sender_id', userId)
    .eq('receiver_id', normalizedReceiverId)
    .maybeSingle();

  if (existingSentRequestError) {
    throw existingSentRequestError;
  }

  if (existingSentRequest?.status === 'pending') {
    throw new Error('A pending friend request to this user already exists.');
  }

  if (existingSentRequest?.status === 'accepted') {
    throw new Error('You are already friends with this user.');
  }

  const { data: incomingPendingRequest, error: incomingPendingRequestError } = await client
    .from('friend_requests')
    .select('id')
    .eq('sender_id', normalizedReceiverId)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (incomingPendingRequestError) {
    throw incomingPendingRequestError;
  }

  if (incomingPendingRequest) {
    throw new Error('This user already sent you a pending request. Please accept or reject it first.');
  }

  if (existingSentRequest?.status === 'rejected') {
    const { data: reopenedRequest, error: reopenError } = await client
      .from('friend_requests')
      .update({ status: 'pending' })
      .eq('id', existingSentRequest.id)
      .select('id, sender_id, receiver_id, status, created_at, updated_at')
      .single();

    if (reopenError) {
      throw reopenError;
    }

    return mapFriendRequest(reopenedRequest);
  }

  const { data: createdRequest, error: createError } = await client
    .from('friend_requests')
    .insert({
      sender_id: userId,
      receiver_id: normalizedReceiverId,
      status: 'pending',
    })
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .single();

  if (createError) {
    throw createError;
  }

  return mapFriendRequest(createdRequest);
}

export async function respondToFriendRequest(currentUser, requestId, action) {
  ensureSupabaseFriendshipMode();

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for responding to a friend request.');
  }

  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) {
    throw new Error('requestId is required.');
  }

  const normalizedAction = String(action || '').trim().toLowerCase();
  if (normalizedAction !== 'accept' && normalizedAction !== 'reject') {
    throw new Error("action must be either 'accept' or 'reject'.");
  }

  const client = getSupabaseClient();
  const { data: requestRow, error: requestError } = await client
    .from('friend_requests')
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .eq('id', normalizedRequestId)
    .single();

  if (requestError) {
    throw requestError;
  }

  if (requestRow.receiver_id !== userId) {
    throw new Error('Only the request receiver can respond to this friend request.');
  }

  if (requestRow.status !== 'pending') {
    throw new Error(`This friend request is already ${requestRow.status}.`);
  }

  let friendship = null;
  if (normalizedAction === 'accept') {
    const { data: insertedFriendship, error: insertFriendshipError } = await client
      .from('friendships')
      .insert({
        user_one_id: requestRow.sender_id,
        user_two_id: requestRow.receiver_id,
      })
      .select('id, user_one_id, user_two_id, created_at')
      .maybeSingle();

    if (insertFriendshipError && insertFriendshipError.code !== '23505') {
      throw insertFriendshipError;
    }

    if (insertedFriendship) {
      friendship = mapFriendship(insertedFriendship, userId);
    } else {
      const existingFriendship = await findExistingFriendship(
        client,
        requestRow.sender_id,
        requestRow.receiver_id
      );
      if (existingFriendship) {
        friendship = mapFriendship(existingFriendship, userId);
      }
    }
  }

  const nextStatus = normalizedAction === 'accept' ? 'accepted' : 'rejected';
  const { data: updatedRequest, error: updateError } = await client
    .from('friend_requests')
    .update({ status: nextStatus })
    .eq('id', requestRow.id)
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .select('id, sender_id, receiver_id, status, created_at, updated_at')
    .single();

  if (updateError) {
    throw updateError;
  }

  return {
    request: mapFriendRequest(updatedRequest),
    friendship,
  };
}

export async function listFriends(currentUser) {
  ensureSupabaseFriendshipMode();

  const userId = await resolveSupabaseUserId(currentUser);
  if (!userId) {
    throw new Error('No authenticated Supabase user available for loading friends.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('friendships')
    .select('id, user_one_id, user_two_id, created_at')
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapFriendship(row, userId));
}
