/**
 * Notification smoke tests.
 * Verifies the notification lifecycle: receive, list, mark-as-read.
 *
 * Depends on test-friendship having run first (its friend_request inserts/updates
 * fire the DB trigger that generates the notifications tested here).
 *
 * Load: ~8 DB operations — Free Tier safe.
 *
 * Run standalone:
 *   node scripts/smoke/test-notifications.js
 *
 * Or consumed by runner.js with a shared context.
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

async function runNotificationTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;
  let firstUnreadForA;
  let firstNotificationForA;
  let firstNotificationForB;

  await runTest('notifications: A has at least one notification', async () => {
    const { data, error } = await clientA
      .from('notifications')
      .select('id, type, actor_id, read_at, created_at')
      .eq('user_id', idA)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      throw error;
    }

    assert(Array.isArray(data) && data.length > 0, 'A should have at least one notification after friendship tests');
    firstNotificationForA = data[0] || null;
    firstUnreadForA = (data || []).find((n) => n.read_at === null);
  });

  await runTest('notifications: A cannot read B notifications (RLS)', async () => {
    const { data, error } = await clientA
      .from('notifications')
      .select('id')
      .eq('user_id', idB)
      .limit(1);

    if (error) {
      throw error;
    }

    assertEqual((data || []).length, 0, 'A must not see B notifications');
  });

  await runTest('notifications: A has at least one unread notification', async () => {
    assert(firstUnreadForA != null, 'A should have at least one unread notification');
    assert(firstUnreadForA.read_at === null, 'Unread notification should have read_at = null');
  });

  await runTest('notifications: mark single notification as read for A', async () => {
    assert(firstUnreadForA != null, 'Need an unread notification to mark');

    const { error } = await clientA
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', firstUnreadForA.id)
      .eq('user_id', idA)
      .is('read_at', null);

    if (error) {
      throw error;
    }

    // Re-fetch and confirm read_at is set.
    const { data: updated, error: fetchErr } = await clientA
      .from('notifications')
      .select('id, read_at')
      .eq('id', firstUnreadForA.id)
      .single();

    if (fetchErr) {
      throw fetchErr;
    }

    assert(updated.read_at !== null, 'read_at should be set after marking as read');
  });

  await runTest('notifications: B has at least one notification', async () => {
    const { data, error } = await clientB
      .from('notifications')
      .select('id, type, read_at, created_at')
      .eq('user_id', idB)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    assert(Array.isArray(data) && data.length > 0, 'B should have at least one unread notification');
    firstNotificationForB = data[0] || null;
  });

  await runTest('notifications: A cannot update B notification', async () => {
    assert(firstNotificationForB != null, 'Need a B notification for cross-user update test');

    const { data, error } = await clientA
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', firstNotificationForB.id)
      .eq('user_id', idB)
      .is('read_at', null)
      .select('id');

    if (error) {
      throw error;
    }

    assertEqual((data || []).length, 0, 'A must not update B notifications');
  });

  await runTest('notifications: direct insert by authenticated user is blocked', async () => {
    const { error } = await clientA
      .from('notifications')
      .insert({
        user_id: idA,
        type: 'friend_request_received',
        actor_id: idB,
      })
      .select('id')
      .single();

    assert(error, 'Expected direct notification insert to fail');
  });

  await runTest('notifications: immutable fields cannot be changed', async () => {
    assert(firstNotificationForA != null, 'Need an A notification for immutability test');

    const { error } = await clientA
      .from('notifications')
      .update({ type: 'friend_request_rejected' })
      .eq('id', firstNotificationForA.id)
      .eq('user_id', idA)
      .select('id')
      .single();

    assert(error, 'Expected immutable field update to fail');
  });

  await runTest('notifications: mark all read for B — unread count drops to 0', async () => {
    const { error: updateErr } = await clientB
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', idB)
      .is('read_at', null);

    if (updateErr) {
      throw updateErr;
    }

    const { data: remaining, error: checkErr } = await clientB
      .from('notifications')
      .select('id')
      .eq('user_id', idB)
      .is('read_at', null);

    if (checkErr) {
      throw checkErr;
    }

    assertEqual((remaining || []).length, 0, 'B should have 0 unread notifications after markAllRead');
  });
}

if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  provisionSmokeUsers(admin, url, anonKey)
    .then(async (provisioned) => {
      ctx = provisioned;

      // Run friendship tests first so notifications are generated.
      const { runFriendshipTests } = require('./test-friendship');
      await runFriendshipTests(ctx);

      await runNotificationTests(ctx);
      console.log('[smoke:notifications] PASS');
    })
    .catch((err) => {
      console.error('[smoke:notifications] FAIL:', err.message || err);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (ctx?.userIds) {
        await ensureAuthUsersDeleted(admin, ctx.userIds);
      }
    });
}

module.exports = { runNotificationTests };
