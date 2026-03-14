import { getSupabaseClient } from '../client/supabaseClient';
import { canUseSupabase, getBackendConfig } from '../config/env';
import { logError, logInfo, logWarn } from '../observability/logger';

function mapFriendRequest(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    senderDisplayName: row.sender_display_name || null,
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
  const [firstPairResult, secondPairResult] = await Promise.all([
    client
      .from('friendships')
      .select('id, user_one_id, user_two_id, created_at')
      .eq('user_one_id', userId)
      .eq('user_two_id', otherUserId)
      .maybeSingle(),
    client
      .from('friendships')
      .select('id, user_one_id, user_two_id, created_at')
      .eq('user_one_id', otherUserId)
      .eq('user_two_id', userId)
      .maybeSingle(),
  ]);

  if (firstPairResult.error) {
    throw firstPairResult.error;
  }

  if (secondPairResult.error) {
    throw secondPairResult.error;
  }

  return firstPairResult.data || secondPairResult.data || null;
}

export async function sendFriendRequest(currentUser, receiverUserId) {
  const startedAt = Date.now();
  ensureSupabaseFriendshipMode();

  try {
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

    logInfo('friendship.request.send.requested', {
      hasCurrentUser: Boolean(currentUser?.id),
      isSelfRequest: normalizedReceiverId === userId,
    });

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

      const mapped = mapFriendRequest(reopenedRequest);
      logInfo('friendship.request.send.completed', {
        outcome: 'reopened',
        durationMs: Date.now() - startedAt,
      });
      return mapped;
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

    const mapped = mapFriendRequest(createdRequest);
    logInfo('friendship.request.send.completed', {
      outcome: 'created',
      durationMs: Date.now() - startedAt,
    });
    return mapped;
  } catch (error) {
    logError('friendship.request.send.failed', error, {
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function sendFriendRequestByDisplayName(currentUser, displayName) {
  ensureSupabaseFriendshipMode();

  const normalizedDisplayName = String(displayName || '').trim();
  if (!normalizedDisplayName) {
    throw new Error('displayName is required.');
  }

  const client = getSupabaseClient();
  const { data, error } = await client.rpc('find_profile_by_display_name', {
    input_display_name: normalizedDisplayName,
  });

  if (error) {
    throw error;
  }

  const matches = Array.isArray(data) ? data : data ? [data] : [];
  if (matches.length > 1) {
    throw new Error(
      `Display name "${normalizedDisplayName}" is not unique. Please use another identifier.`
    );
  }

  const match = matches[0] || null;
  if (!match?.id) {
    throw new Error(`No user found with display name "${normalizedDisplayName}".`);
  }

  const request = await sendFriendRequest(currentUser, match.id);
  return {
    request,
    targetUser: {
      id: match.id,
      displayName: match.display_name || normalizedDisplayName,
    },
  };
}

export async function respondToFriendRequest(currentUser, requestId, action) {
  const startedAt = Date.now();
  ensureSupabaseFriendshipMode();

  try {
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

    const { data: rpcData, error: rpcError } = await client.rpc('respond_to_friend_request', {
      input_request_id: normalizedRequestId,
      input_action: normalizedAction,
    });

    if (!rpcError) {
      const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const request = mapFriendRequest(rpcRow);
      const friendship =
        normalizedAction === 'accept' && rpcRow?.friendship_id
          ? {
              id: rpcRow.friendship_id,
              userOneId: rpcRow.friendship_user_one_id,
              userTwoId: rpcRow.friendship_user_two_id,
              friendUserId:
                rpcRow.friendship_user_one_id === userId
                  ? rpcRow.friendship_user_two_id
                  : rpcRow.friendship_user_one_id,
              createdAt: rpcRow.friendship_created_at,
              source: 'supabase',
            }
          : null;

      const result = { request, friendship };
      logInfo('friendship.request.respond.completed', {
        action: normalizedAction,
        createdFriendship: Boolean(friendship),
        source: 'rpc',
        durationMs: Date.now() - startedAt,
      });

      return result;
    }

    const missingRpcFunction =
      rpcError.code === 'PGRST202' ||
      String(rpcError.message || '').toLowerCase().includes('does not exist');

    if (!missingRpcFunction) {
      throw rpcError;
    }

    logWarn('friendship.request.respond.rpc_missing', {
      code: rpcError.code || null,
    });

    const result = await respondToFriendRequestLegacy(
      client,
      userId,
      normalizedRequestId,
      normalizedAction
    );

    logInfo('friendship.request.respond.completed', {
      action: normalizedAction,
      createdFriendship: Boolean(result.friendship),
      source: 'legacy',
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    logError('friendship.request.respond.failed', error, {
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

async function respondToFriendRequestLegacy(client, userId, requestId, action) {
    const { data: requestRow, error: requestError } = await client
      .from('friend_requests')
      .select('id, sender_id, receiver_id, status, created_at, updated_at')
      .eq('id', requestId)
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
    if (action === 'accept') {
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

    const nextStatus = action === 'accept' ? 'accepted' : 'rejected';
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
  const [asUserOneResult, asUserTwoResult] = await Promise.all([
    client
      .from('friendships')
      .select('id, user_one_id, user_two_id, created_at')
      .eq('user_one_id', userId)
      .order('created_at', { ascending: false }),
    client
      .from('friendships')
      .select('id, user_one_id, user_two_id, created_at')
      .eq('user_two_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (asUserOneResult.error) {
    throw asUserOneResult.error;
  }

  if (asUserTwoResult.error) {
    throw asUserTwoResult.error;
  }

  const merged = [...(asUserOneResult.data || []), ...(asUserTwoResult.data || [])];
  const dedupedById = Array.from(new Map(merged.map((row) => [row.id, row])).values());
  dedupedById.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return dedupedById.map((row) => mapFriendship(row, userId));
}

export async function listIncomingFriendRequests(currentUser) {
  const startedAt = Date.now();
  ensureSupabaseFriendshipMode();

  try {
    const userId = await resolveSupabaseUserId(currentUser);
    if (!userId) {
      throw new Error('No authenticated Supabase user available for loading friend requests.');
    }

    const client = getSupabaseClient();
    const { data: withNames, error: withNamesError } = await client.rpc(
      'list_incoming_friend_requests_with_sender',
      {
        input_user_id: userId,
      }
    );

    if (!withNamesError) {
      const mapped = (withNames || []).map(mapFriendRequest);
      logInfo('friendship.request.incoming.loaded', {
        source: 'rpc',
        count: mapped.length,
        durationMs: Date.now() - startedAt,
      });
      return mapped;
    }

    const missingRpcFunction =
      withNamesError.code === 'PGRST202' ||
      String(withNamesError.message || '').toLowerCase().includes('does not exist');

    if (!missingRpcFunction) {
      throw withNamesError;
    }

    logWarn('friendship.request.incoming.rpc_missing', {
      code: withNamesError.code || null,
    });

    const { data, error } = await client
      .from('friend_requests')
      .select('id, sender_id, receiver_id, status, created_at, updated_at')
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const mapped = (data || []).map(mapFriendRequest);
    logInfo('friendship.request.incoming.loaded', {
      source: 'fallback-query',
      count: mapped.length,
      durationMs: Date.now() - startedAt,
    });
    return mapped;
  } catch (error) {
    logError('friendship.request.incoming.failed', error, {
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
