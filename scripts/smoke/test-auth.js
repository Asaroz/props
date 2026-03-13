/**
 * Auth smoke tests.
 * Covers: signup, login success, login failure, logout.
 *
 * Run standalone:
 *   node scripts/smoke/test-auth.js
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

async function runAuthTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;

  await runTest('auth: login returns valid user id for A', async () => {
    assert(loginA.user?.id, 'Login A did not return a user id.');
  });

  await runTest('auth: login returns valid user id for B', async () => {
    assert(loginB.user?.id, 'Login B did not return a user id.');
  });

  await runTest('auth: login failure with wrong password', async () => {
    // Uses a fresh unauthenticated client to avoid polluting clientA session
    const { url, anonKey } = ctx.env;
    const { error } = await createAnonClient(url, anonKey).auth.signInWithPassword({
      email: loginA.user.email,
      password: 'wrong_password_xyz',
    });
    assert(error, 'Expected login failure with wrong password, but login succeeded.');
  });

  await runTest('auth: logout user A', async () => {
    const { error } = await clientA.auth.signOut();
    if (error) {
      throw error;
    }
  });

  await runTest('auth: logout user B', async () => {
    const { error } = await clientB.auth.signOut();
    if (error) {
      throw error;
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
      await runAuthTests(ctx);
      console.log('[smoke] PASS: auth tests completed.');
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

module.exports = { runAuthTests };
