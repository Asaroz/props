/**
 * Mini friendship smoke tests (low-load).
 *
 * Run:
 *   node scripts/smoke/test-friendship-mini.js
 */

const {
  requireEnv,
  createAdminClient,
  runTest,
  assert,
  assertEqual,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

async function runFriendshipMiniTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;

  let pendingRequest;

  await runTest('friendship-mini: send request A -> B', async () => {
    const { data, error } = await clientA
      .from('friend_requests')
      .insert({ sender_id: idA, receiver_id: idB, status: 'pending' })
      .select('id, sender_id, receiver_id, status')
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.status, 'pending', 'Request should be pending after create');
    assertEqual(data.sender_id, idA, 'Sender mismatch');
    assertEqual(data.receiver_id, idB, 'Receiver mismatch');
    pendingRequest = data;
  });

  await runTest('friendship-mini: duplicate request blocked', async () => {
    const { error } = await clientA
      .from('friend_requests')
      .insert({ sender_id: idA, receiver_id: idB, status: 'pending' })
      .select('id')
      .single();

    assert(error, 'Expected duplicate request to fail');
  });

  await runTest('friendship-mini: accept request and list visible', async () => {
    const { error: friendshipErr } = await clientB
      .from('friendships')
      .insert({ user_one_id: idA, user_two_id: idB })
      .select('id')
      .single();

    if (friendshipErr) {
      throw friendshipErr;
    }

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

    assertEqual(accepted.status, 'accepted', 'Request should be accepted');

    const { data: friendsA, error: listErr } = await clientA
      .from('friendships')
      .select('id, user_one_id, user_two_id')
      .or(`user_one_id.eq.${idA},user_two_id.eq.${idA}`);

    if (listErr) {
      throw listErr;
    }

    const visible = (friendsA || []).some(
      (f) =>
        (f.user_one_id === idA && f.user_two_id === idB) ||
        (f.user_one_id === idB && f.user_two_id === idA)
    );

    assert(visible, 'Friendship should be visible in A friend list');
  });
}

if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  (async () => {
    try {
      console.log('[smoke-mini] low-load mode: 3 friendship checks');
      ctx = await provisionSmokeUsers(admin, url, anonKey);
      await runFriendshipMiniTests(ctx);
      console.log('[smoke-mini] PASS: friendship mini tests completed.');
    } finally {
      if (ctx?.userIds) {
        await ensureAuthUsersDeleted(admin, ctx.userIds);
      }
    }
  })().catch((err) => {
    console.error('[smoke-mini] FAIL:', err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { runFriendshipMiniTests };
