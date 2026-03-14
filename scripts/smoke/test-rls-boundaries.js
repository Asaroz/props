/**
 * RLS boundary smoke tests.
 * Covers: unauthenticated access, cross-user profile write denial,
 * and props insert denial for non-friend targets.
 *
 * Run standalone:
 *   node scripts/smoke/test-rls-boundaries.js
 *
 * Or consumed by runner.js with a shared context.
 */

const {
  requireEnv,
  createAdminClient,
  createAnonClient,
  assert,
  runTest,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

async function ensureThirdUser(admin, ctx) {
  const runId = `${ctx.runId}_rls`;
  const email = `smokec${runId}@examplemail.com`;
  const password = 'SmokeTest_123456';

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: `smoke_c_${runId}`,
      displayName: 'Smoke C',
      city: 'Cologne',
    },
  });

  if (createErr) {
    throw createErr;
  }

  const userCId = created?.user?.id;
  assert(userCId, 'User C id missing after admin provisioning.');

  // Ensure profile row exists even if auth trigger is unavailable in the environment.
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userCId,
      email,
      username: `smoke_c_${runId}`,
      display_name: 'Smoke C',
      city: 'Cologne',
      bio: '',
    },
    { onConflict: 'id' }
  );

  if (profileErr) {
    throw profileErr;
  }

  ctx.userIds.push(userCId);
  return { userCId, email, password };
}

async function runRlsBoundaryTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;

  await runTest('rls: unauthenticated profile read is blocked', async () => {
    const unauthClient = createAnonClient(ctx.env.url, ctx.env.anonKey);
    const { data, error } = await unauthClient
      .from('profiles')
      .select('id, email')
      .eq('id', idA)
      .maybeSingle();

    // Depending on PostgREST behavior, this can be a hard RLS error or an empty result.
    assert(error || !data, 'Unauthenticated profile read should not return private data.');
  });

  await runTest('rls: unauthenticated friend request insert is blocked', async () => {
    const unauthClient = createAnonClient(ctx.env.url, ctx.env.anonKey);
    const { error } = await unauthClient.from('friend_requests').insert({
      sender_id: idA,
      receiver_id: idB,
      status: 'pending',
    });

    assert(error, 'Unauthenticated friend request insert should fail.');
  });

  await runTest('rls: cross-user profile update is blocked', async () => {
    const hackedCity = `Hacked_${ctx.runId}`;

    const { data, error } = await clientA
      .from('profiles')
      .update({ city: hackedCity })
      .eq('id', idB)
      .select('id, city');

    // Either an explicit permission error or no affected rows is acceptable.
    assert(error || !data || data.length === 0, 'Cross-user profile update must be blocked.');

    const { data: ownProfile, error: ownErr } = await clientB
      .from('profiles')
      .select('id, city')
      .eq('id', idB)
      .single();

    if (ownErr) {
      throw ownErr;
    }

    assert(ownProfile.city !== hackedCity, 'Target user city should remain unchanged.');
  });

  await runTest('rls: props insert to non-friend target is blocked', async () => {
    const { userCId } = await ensureThirdUser(ctx.admin, ctx);

    const { data, error } = await clientA
      .from('props_entries')
      .insert({
        from_user_id: idA,
        to_user_id: userCId,
        content: 'This should be blocked',
        category: 'boundary',
      })
      .select('id')
      .maybeSingle();

    if (data?.id) {
      // Clean up the leaked row before failing so the DB stays consistent.
      await clientA.from('props_entries').delete().eq('id', data.id);
      throw new Error(
        'Non-friend props insert succeeded — friendship-enforcement trigger (20260315004000) is not active in this environment.'
      );
    }

    // error is expected (trigger should raise an exception)
    if (!error) {
      throw new Error('Expected an error from the friendship-enforcement trigger but got neither data nor error.');
    }
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
      ctx.env = { url, anonKey };
      ctx.admin = admin;
      await runRlsBoundaryTests(ctx);
      console.log('[smoke] PASS: rls-boundary tests completed.');
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

module.exports = { runRlsBoundaryTests };
