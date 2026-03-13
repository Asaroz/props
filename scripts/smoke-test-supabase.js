/**
 * Entry point kept for backward compatibility.
 * The suite has been split into scripts/smoke/.
 *
 * Use:
 *   npm run smoke:test          — all tests
 *   npm run smoke:auth          — auth only
 *   npm run smoke:profile       — profile only
 *   npm run smoke:friendship    — friendship only
 */

require('./smoke/runner');

/*
 * Original monolithic suite (archived below for reference).
 * Supabase backend smoke test suite (small test cases).
 *
 * Goals:
 * - cover current backend features with lightweight checks
 * - reuse the same created users across all tests
 * - keep load low for free-tier backend usage
 *
 * Cleanup:
 * - always deletes created auth users in finally
 *
 * Run:
 *   node scripts/smoke-test-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing .env file.');
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }

  return env;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected: ${expected}, got: ${actual}`);
  }
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw error;
  }

  return (data?.users || []).find((user) => user.email === email) || null;
}

async function ensureAuthUsersDeleted(admin, userIds) {
  for (const userId of userIds) {
    if (!userId) {
      continue;
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`[cleanup] Failed to delete auth user ${userId}: ${error.message}`);
    } else {
      console.log(`[cleanup] Deleted auth user ${userId}`);
    }
  }
}

async function signUpUser(client, payload) {
  const { data, error } = await client.auth.signUp(payload);
  if (error) {
    throw error;
  }

  return data;
}

async function createUserWithAdmin(admin, payload) {
  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      username: payload.options?.data?.username || '',
      displayName: payload.options?.data?.displayName || '',
      city: payload.options?.data?.city || '',
    },
  });

  if (error) {
    throw error;
  }

  return data.user;
}

function isRateLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('rate limit');
}

async function provisionUserWithSignupOrFallback(admin, url, anonKey, payload) {
  try {
    await signUpUser(createAnonClient(url, anonKey), payload);
    return { mode: 'signup' };
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    const adminUser = await createUserWithAdmin(admin, payload);
    return { mode: 'admin-fallback', userId: adminUser.id };
  }
}

async function loginUser(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  assert(data?.user?.id, `Login returned no user for ${email}.`);
  return data;
}

async function expectLoginFailure(client, email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (!error) {
    throw new Error(`Expected login failure for ${email}, but login succeeded.`);
  }
}

async function sendFriendRequest(senderClient, senderId, receiverId) {
  const { data, error } = await senderClient
    .from('friend_requests')
    .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
    .select('id, sender_id, receiver_id, status')
    .single();

  if (error) {
    throw error;
  }

  assert(data.status === 'pending', 'Friend request status should be pending.');
  return data;
}

async function expectSendFriendRequestFailure(senderClient, senderId, receiverId) {
  const { error } = await senderClient
    .from('friend_requests')
    .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
    .select('id')
    .single();

  if (!error) {
    throw new Error('Expected duplicate friend request to fail, but it succeeded.');
  }
}

async function rejectFriendRequest(receiverClient, requestRow) {
  const { data, error } = await receiverClient
    .from('friend_requests')
    .update({ status: 'rejected' })
    .eq('id', requestRow.id)
    .eq('receiver_id', requestRow.receiver_id)
    .eq('status', 'pending')
    .select('id, status')
    .single();

  if (error) {
    throw error;
  }

  assertEqual(data.status, 'rejected', 'Friend request should be rejected');
  return data;
}

async function acceptFriendRequest(receiverClient, requestRow) {
  const { data: friendship, error: friendshipError } = await receiverClient
    .from('friendships')
    .insert({
      user_one_id: requestRow.sender_id,
      user_two_id: requestRow.receiver_id,
    })
    .select('id, user_one_id, user_two_id')
    .single();

  if (friendshipError) {
    throw friendshipError;
  }

  const { data: updatedRequest, error: requestUpdateError } = await receiverClient
    .from('friend_requests')
    .update({ status: 'accepted' })
    .eq('id', requestRow.id)
    .eq('receiver_id', requestRow.receiver_id)
    .eq('status', 'pending')
    .select('id, status')
    .single();

  if (requestUpdateError) {
    throw requestUpdateError;
  }

  assert(updatedRequest.status === 'accepted', 'Friend request status should be accepted.');
  return friendship;
}

async function listFriendshipsForUser(client, userId) {
  const { data, error } = await client
    .from('friendships')
    .select('id, user_one_id, user_two_id, created_at')
    .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`);

  if (error) {
    throw error;
  }

  return data || [];
}

async function getOwnProfile(client, userId) {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, city, bio')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateOwnProfile(client, userId, patch) {
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id, city, bio')
    .single();

  if (error) {
    throw error;
  }

  assertEqual(data.id, userId, 'Updated profile id mismatch');
  return data;
}

async function runTest(name, fn) {
  const start = Date.now();
  await fn();
  const ms = Date.now() - start;
  console.log(`[smoke] PASS ${name} (${ms}ms)`);
}

async function main() {
  const env = loadEnv();
  const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing env keys. Required: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const admin = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const createdUserIds = [];

  const runId = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const password = 'SmokeTest_123456';
  const userA = {
    email: `smokea${runId}@examplemail.com`,
    password,
    options: {
      data: {
        username: `smoke_a_${runId}`,
        displayName: 'Smoke A',
        city: 'Berlin',
      },
    },
  };
  const userB = {
    email: `smokeb${runId}@examplemail.com`,
    password,
    options: {
      data: {
        username: `smoke_b_${runId}`,
        displayName: 'Smoke B',
        city: 'Hamburg',
      },
    },
  };

  console.log(`[smoke] Run id: ${runId}`);
  console.log('[smoke] Free-tier mode: low-load suite with shared users');
  console.log('[smoke] Estimated request volume: low (< 60 DB/Auth operations)');

  try {
    await runTest('signup user A', async () => {
      const provisionA = await provisionUserWithSignupOrFallback(
        admin,
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        userA
      );

      if (provisionA.mode === 'admin-fallback') {
        console.log('[smoke] signup rate limit hit for user A, used admin fallback');
      }
    });

    await runTest('signup user B', async () => {
      const provisionB = await provisionUserWithSignupOrFallback(
        admin,
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        userB
      );

      if (provisionB.mode === 'admin-fallback') {
        console.log('[smoke] signup rate limit hit for user B, used admin fallback');
      }
    });

    const authUserA = await findAuthUserByEmail(admin, userA.email);
    const authUserB = await findAuthUserByEmail(admin, userB.email);

    assert(authUserA?.id, 'Sign up user A was not created in auth.users.');
    assert(authUserB?.id, 'Sign up user B was not created in auth.users.');

    createdUserIds.push(authUserA.id, authUserB.id);

    await admin.auth.admin.updateUserById(authUserA.id, { email_confirm: true });
    await admin.auth.admin.updateUserById(authUserB.id, { email_confirm: true });

    const clientA = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const clientB = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const invalidLoginClient = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let loginA;
    let loginB;
    let pendingRequestAtoB;

    await runTest('login success user A', async () => {
      loginA = await loginUser(clientA, userA.email, password);
    });

    await runTest('login success user B', async () => {
      loginB = await loginUser(clientB, userB.email, password);
    });

    await runTest('login failure wrong password', async () => {
      await expectLoginFailure(invalidLoginClient, userA.email, 'wrong_password');
    });

    await runTest('profile read own', async () => {
      const profileA = await getOwnProfile(clientA, loginA.user.id);
      assertEqual(profileA.id, loginA.user.id, 'Profile read id mismatch for user A');
    });

    await runTest('profile update own', async () => {
      const patch = {
        city: `SmokeCity_${runId}`,
        bio: `Smoke bio ${runId}`,
      };
      const updated = await updateOwnProfile(clientA, loginA.user.id, patch);
      assertEqual(updated.city, patch.city, 'Updated city mismatch');
      assertEqual(updated.bio, patch.bio, 'Updated bio mismatch');
    });

    await runTest('friend request reject flow (B -> A)', async () => {
      const request = await sendFriendRequest(clientB, loginB.user.id, loginA.user.id);
      await rejectFriendRequest(clientA, request);
    });

    await runTest('friend request pending create (A -> B)', async () => {
      pendingRequestAtoB = await sendFriendRequest(clientA, loginA.user.id, loginB.user.id);
      assertEqual(pendingRequestAtoB.status, 'pending', 'Pending request expected');
    });

    await runTest('friend request duplicate blocked', async () => {
      await expectSendFriendRequestFailure(clientA, loginA.user.id, loginB.user.id);
    });

    await runTest('friend request accept flow', async () => {
      const friendship = await acceptFriendRequest(clientB, pendingRequestAtoB);
      assertEqual(friendship.user_one_id, loginA.user.id, 'Friendship user_one_id mismatch');
      assertEqual(friendship.user_two_id, loginB.user.id, 'Friendship user_two_id mismatch');
    });

    await runTest('list friends includes created friendship', async () => {
      const friendsA = await listFriendshipsForUser(clientA, loginA.user.id);
      const friendsB = await listFriendshipsForUser(clientB, loginB.user.id);
      assert(
        friendsA.some(
          (f) =>
            (f.user_one_id === loginA.user.id && f.user_two_id === loginB.user.id) ||
            (f.user_one_id === loginB.user.id && f.user_two_id === loginA.user.id)
        ),
        'Expected friendship not found for user A'
      );
      assert(
        friendsB.some(
          (f) =>
            (f.user_one_id === loginA.user.id && f.user_two_id === loginB.user.id) ||
            (f.user_one_id === loginB.user.id && f.user_two_id === loginA.user.id)
        ),
        'Expected friendship not found for user B'
      );
    });

    await runTest('logout user A', async () => {
      const { error } = await clientA.auth.signOut();
      if (error) {
        throw error;
      }
    });

    await runTest('logout user B', async () => {
      const { error } = await clientB.auth.signOut();
      if (error) {
        throw error;
      }
    });

    console.log('[smoke] PASS: suite completed.');
  } finally {
    console.log('[smoke] cleanup: deleting created users');
    await ensureAuthUsersDeleted(admin, createdUserIds);
  }
}

main().catch((error) => {
  console.error('[smoke] FAIL:', error.message || error);
  process.exitCode = 1;
});
