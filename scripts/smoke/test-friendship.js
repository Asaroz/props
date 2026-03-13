/**
 * Friendship smoke tests.
 * Covers: reject flow, pending create, duplicate blocked, accept flow, list friends.
 *
 * Run standalone:
 *   node scripts/smoke/test-friendship.js
 *
 * Or consumed by runner.js with a shared context.
 */

const {
  requireEnv,
  createAdminClient,
  assert,
  assertEqual,
  runTest,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

async function runFriendshipTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;
  let pendingRequest;

  await runTest('friendship: reject flow (B -> A)', async () => {
    const { data: request, error: sendErr } = await clientB
      .from('friend_requests')
      .insert({ sender_id: idB, receiver_id: idA, status: 'pending' })
      .select('id, receiver_id, status')
      .single();

    if (sendErr) {
      throw sendErr;
    }

    assertEqual(request.status, 'pending', 'Request status after send');

    const { data: rejected, error: rejectErr } = await clientA
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', request.id)
      .eq('receiver_id', idA)
      .eq('status', 'pending')
      .select('id, status')
      .single();

    if (rejectErr) {
      throw rejectErr;
    }

    assertEqual(rejected.status, 'rejected', 'Request status after reject');
  });

  await runTest('friendship: send pending request (A -> B)', async () => {
    const { data, error } = await clientA
      .from('friend_requests')
      .insert({ sender_id: idA, receiver_id: idB, status: 'pending' })
      .select('id, sender_id, receiver_id, status')
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.status, 'pending', 'New request should be pending');
    pendingRequest = data;
  });

  await runTest('friendship: duplicate request is blocked', async () => {
    const { error } = await clientA
      .from('friend_requests')
      .insert({ sender_id: idA, receiver_id: idB, status: 'pending' })
      .select('id')
      .single();

    assert(error, 'Expected duplicate insert to fail, but it succeeded.');
  });

  await runTest('friendship: accept request + friendship created', async () => {
    const { data: friendship, error: friendshipErr } = await clientB
      .from('friendships')
      .insert({ user_one_id: pendingRequest.sender_id, user_two_id: pendingRequest.receiver_id })
      .select('id, user_one_id, user_two_id')
      .single();

    if (friendshipErr) {
      throw friendshipErr;
    }

    assertEqual(friendship.user_one_id, idA, 'Friendship user_one_id mismatch');
    assertEqual(friendship.user_two_id, idB, 'Friendship user_two_id mismatch');

    const { data: accepted, error: acceptErr } = await clientB
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', pendingRequest.id)
      .eq('receiver_id', idB)
      .eq('status', 'pending')
      .select('id, status')
      .single();

    if (acceptErr) {
      throw acceptErr;
    }

    assertEqual(accepted.status, 'accepted', 'Request status after accept');
  });

  await runTest('friendship: list friends visible for both users', async () => {
    const { data: friendsA, error: errA } = await clientA
      .from('friendships')
      .select('id, user_one_id, user_two_id')
      .or(`user_one_id.eq.${idA},user_two_id.eq.${idA}`);

    if (errA) {
      throw errA;
    }

    const { data: friendsB, error: errB } = await clientB
      .from('friendships')
      .select('id, user_one_id, user_two_id')
      .or(`user_one_id.eq.${idB},user_two_id.eq.${idB}`);

    if (errB) {
      throw errB;
    }

    const isPair = (f) =>
      (f.user_one_id === idA && f.user_two_id === idB) ||
      (f.user_one_id === idB && f.user_two_id === idA);

    assert(friendsA.some(isPair), 'Friendship not visible for user A');
    assert(friendsB.some(isPair), 'Friendship not visible for user B');
  });
}

// Standalone execution
if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  (async () => {
    try {
      ctx = await provisionSmokeUsers(admin, url, anonKey);
      await runFriendshipTests(ctx);
      console.log('[smoke] PASS: friendship tests completed.');
    } finally {
      if (ctx?.userIds) {
        await ensureAuthUsersDeleted(admin, ctx.userIds);
      }
    }
  })().catch((err) => {
    console.error('[smoke] FAIL:', err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { runFriendshipTests };
