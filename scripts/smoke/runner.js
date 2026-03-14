/**
 * Smoke test suite runner.
 * Provisions users once, runs all test modules, always cleans up.
 *
 * Run all:
 *   node scripts/smoke/runner.js
 *
 * Run individual modules without this runner:
 *   node scripts/smoke/test-auth.js
 *   node scripts/smoke/test-profile.js
 *   node scripts/smoke/test-friendship.js
 */

const {
  requireEnv,
  createAdminClient,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

const { runAuthTests } = require('./test-auth');
const { runProfileTests } = require('./test-profile');
const { runFriendshipTests } = require('./test-friendship');
const { runPropsTests } = require('./test-props');
const { runRlsBoundaryTests } = require('./test-rls-boundaries');
const { runVouchingTests } = require('./test-vouching');

async function main() {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  console.log('[smoke] Free-tier mode: low-load suite with shared users');
  console.log('[smoke] Estimated request volume: low (< 60 DB/Auth operations)');

  try {
    ctx = await provisionSmokeUsers(admin, url, anonKey);
    ctx.env = { url, anonKey };
    ctx.admin = admin;

    console.log(`[smoke] Run id: ${ctx.runId}`);
    console.log('[smoke] --- auth ---');
    await runAuthTests(ctx);

    // Re-login both users after logout in auth tests
    const { data: loginA, error: errA } = await ctx.clientA.auth.signInWithPassword({
      email: ctx.loginA.user.email,
      password: 'SmokeTest_123456',
    });
    if (errA) {
      throw errA;
    }

    const { data: loginB, error: errB } = await ctx.clientB.auth.signInWithPassword({
      email: ctx.loginB.user.email,
      password: 'SmokeTest_123456',
    });
    if (errB) {
      throw errB;
    }

    ctx.loginA = loginA;
    ctx.loginB = loginB;

    console.log('[smoke] --- profile ---');
    await runProfileTests(ctx);

    console.log('[smoke] --- friendship ---');
    await runFriendshipTests(ctx);

    console.log('[smoke] --- props ---');
    await runPropsTests(ctx);

    console.log('[smoke] --- rls-boundaries ---');
    await runRlsBoundaryTests(ctx);

    console.log('[smoke] --- vouching ---');
    await runVouchingTests({ ...ctx, url, anonKey, admin });

    console.log('[smoke] PASS: all tests completed.');
  } finally {
    if (ctx?.userIds) {
      console.log('[smoke] cleanup: deleting created users');
      await ensureAuthUsersDeleted(admin, ctx.userIds);
    }
  }
}

main().catch((err) => {
  console.error('[smoke] FAIL:', err.message || err);
  process.exitCode = 1;
});
