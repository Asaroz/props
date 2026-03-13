/**
 * Profile smoke tests.
 * Covers: read own profile, update own profile.
 *
 * Run standalone:
 *   node scripts/smoke/test-profile.js
 *
 * Or consumed by runner.js with a shared context.
 */

const {
  requireEnv,
  createAdminClient,
  createAnonClient,
  assertEqual,
  runTest,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

async function runProfileTests(ctx) {
  const { clientA, loginA, runId } = ctx;

  await runTest('profile: read own profile', async () => {
    const { data, error } = await clientA
      .from('profiles')
      .select('id, email, city, bio')
      .eq('id', loginA.user.id)
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.id, loginA.user.id, 'Profile id mismatch');
  });

  await runTest('profile: update own profile (city + bio)', async () => {
    const newCity = `SmokeCity_${runId}`;
    const newBio = `Smoke bio for run ${runId}`;

    const { data, error } = await clientA
      .from('profiles')
      .update({ city: newCity, bio: newBio })
      .eq('id', loginA.user.id)
      .select('id, city, bio')
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.city, newCity, 'Updated city mismatch');
    assertEqual(data.bio, newBio, 'Updated bio mismatch');
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
      await runProfileTests(ctx);
      console.log('[smoke] PASS: profile tests completed.');
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

module.exports = { runProfileTests };
