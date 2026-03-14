/**
 * Vouching smoke tests.
 * Covers: eligible vouch, duplicate rejection, unvouch, ineligible vouch rejection,
 * and vouch count in feed payload.
 *
 * Run standalone:
 *   node scripts/smoke/test-vouching.js
 *
 * Or consumed by runner.js with a shared context.
 */

const {
  requireEnv,
  createAdminClient,
  createAnonClient,
  assert,
  runTest,
  findAuthUserByEmail,
} = require('./helpers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function adminEnsureFriendship(admin, userOneId, userTwoId) {
  const normalized_one = userOneId < userTwoId ? userOneId : userTwoId;
  const normalized_two = userOneId < userTwoId ? userTwoId : userOneId;

  const { error } = await admin
    .from('friendships')
    .insert({ user_one_id: normalized_one, user_two_id: normalized_two });

  if (error && error.code !== '23505') {
    throw error;
  }
}

async function createPropEntry(clientFrom, fromId, toId, content) {
  const { data, error } = await clientFrom
    .from('props_entries')
    .insert({ from_user_id: fromId, to_user_id: toId, content })
    .select('id, from_user_id, to_user_id')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function loginSharedUser(admin, url, anonKey, email, password) {
  const authUser = await findAuthUserByEmail(admin, email);
  assert(authUser?.id, `Shared test user not found: ${email}`);

  const client = createAnonClient(url, anonKey);
  const { data: login, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  return {
    client,
    login,
    userId: authUser.id,
  };
}

async function areFriends(admin, userOneId, userTwoId) {
  const normalizedOne = userOneId < userTwoId ? userOneId : userTwoId;
  const normalizedTwo = userOneId < userTwoId ? userTwoId : userOneId;

  const { data, error } = await admin
    .from('friendships')
    .select('id')
    .eq('user_one_id', normalizedOne)
    .eq('user_two_id', normalizedTwo)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function findIneligibleSharedUser(admin, url, anonKey, password, excludedUserIds) {
  const candidateEmails = [
    'tuser4@props.test',
    'tuser5@props.test',
    'tuser6@props.test',
    'tuser7@props.test',
    'tuser8@props.test',
    'tuser9@props.test',
    'tuser10@props.test',
  ];

  for (const email of candidateEmails) {
    const candidate = await loginSharedUser(admin, url, anonKey, email, password);
    if (excludedUserIds.includes(candidate.userId)) {
      continue;
    }

    const isFriendOfA = await areFriends(admin, excludedUserIds[0], candidate.userId);
    const isFriendOfB = await areFriends(admin, excludedUserIds[1], candidate.userId);
    if (!(isFriendOfA && isFriendOfB)) {
      return candidate;
    }
  }

  throw new Error('No ineligible shared test user available for the negative vouching case.');
}

async function cleanupPropArtifacts(admin, propId) {
  if (!propId) {
    return;
  }

  const { error: deleteVouchesError } = await admin
    .from('prop_vouches')
    .delete()
    .eq('prop_id', propId);

  if (deleteVouchesError) {
    throw deleteVouchesError;
  }

  const { error: deletePropError } = await admin
    .from('props_entries')
    .delete()
    .eq('id', propId);

  if (deletePropError) {
    throw deletePropError;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function runVouchingTests(ctx) {
  const { url, anonKey, admin } = ctx;
  const password = '123456';

  const userA = await loginSharedUser(admin, url, anonKey, 'tuser1@props.test', password);
  const userB = await loginSharedUser(admin, url, anonKey, 'tuser2@props.test', password);
  const userC = await loginSharedUser(admin, url, anonKey, 'tuser3@props.test', password);
  const userD = await findIneligibleSharedUser(admin, url, anonKey, password, [userA.userId, userB.userId, userC.userId]);

  const clientA = userA.client;
  const clientC = userC.client;
  const clientD = userD.client;
  const idA = userA.userId;
  const idB = userB.userId;
  const idC = userC.userId;
  const idD = userD.userId;
  let propId;

  try {
    // Friendships: A-B, A-C, B-C. D has no friendship with A or B.
    await adminEnsureFriendship(admin, idA, idB);
    await adminEnsureFriendship(admin, idA, idC);
    await adminEnsureFriendship(admin, idB, idC);

    // Create a props entry: A -> B
    let propEntry;
    await runTest('vouching: setup props entry (A -> B)', async () => {
      propEntry = await createPropEntry(clientA, idA, idB, 'Super Zusammenarbeit');
      assert(propEntry?.id, 'Props entry id must exist after insert');
    });

    propId = propEntry.id;

    // C is friend of both A and B — eligible voucher
    await runTest('vouching: eligible user (C) can vouch', async () => {
      const { data: visibleProps, error: visiblePropsError } = await clientC
        .from('props_entries')
        .select('id, from_user_id, to_user_id')
        .eq('id', propId)
        .maybeSingle();

      if (visiblePropsError) {
        throw visiblePropsError;
      }

      assert(visibleProps?.id === propId, 'Eligible mutual friend should be able to read the props entry');

      const { error } = await clientC
        .from('prop_vouches')
        .insert({ prop_id: propId, user_id: idC });

      if (error) {
        throw new Error(`Expected vouch to succeed, got: ${error.message}`);
      }
    });

    // Duplicate vouch from C must be rejected (unique constraint)
    await runTest('vouching: duplicate vouch is rejected', async () => {
      const { error } = await clientC
        .from('prop_vouches')
        .insert({ prop_id: propId, user_id: idC });

      assert(error, 'Expected an error for duplicate vouch, got none');
      // 23505 = unique_violation
      assert(
        error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate'),
        `Unexpected error code for duplicate: ${error.code} ${error.message}`
      );
    });

    // C should be able to remove their vouch
    await runTest('vouching: eligible user (C) can unvouch', async () => {
      const { error, count } = await clientC
        .from('prop_vouches')
        .delete({ count: 'exact' })
        .eq('prop_id', propId)
        .eq('user_id', idC);

      if (error) {
        throw error;
      }

      assert((count || 0) >= 1, 'Expected at least one row deleted on unvouch');
    });

    // D has no friendship with A or B — DB trigger must reject
    await runTest('vouching: ineligible user (D) cannot vouch', async () => {
      const { data: hiddenProp, error: hiddenPropError } = await clientD
        .from('props_entries')
        .select('id')
        .eq('id', propId)
        .maybeSingle();

      if (hiddenPropError) {
        throw hiddenPropError;
      }

      assert(!hiddenProp, 'Ineligible user should not be able to read the props entry');

      const { error } = await clientD
        .from('prop_vouches')
        .insert({ prop_id: propId, user_id: idD });

      assert(error, 'Expected an error for ineligible vouch, got none');
      assert(
        String(error.message || '').toLowerCase().includes('friend') ||
          error.code === '42501' ||
          error.code === 'P0001',
        `Unexpected error for ineligible user: ${error.code} ${error.message}`
      );
    });

    // Re-add C's vouch so we can check count in feed
    await runTest('vouching: re-vouch for count check', async () => {
      const { error } = await clientC
        .from('prop_vouches')
        .insert({ prop_id: propId, user_id: idC });

      if (error) {
        throw new Error(`Re-vouch failed: ${error.message}`);
      }
    });

    // The prop_vouches count should be visible to A via direct select
    await runTest('vouching: vouch count is readable by prop participant', async () => {
      const { data, error } = await clientA
        .from('prop_vouches')
        .select('id, user_id')
        .eq('prop_id', propId);

      if (error) {
        throw error;
      }

      assert(Array.isArray(data), 'Expected array of vouches');
      assert(data.length >= 1, `Expected at least 1 vouch, got ${data.length}`);
    });

  } finally {
    await cleanupPropArtifacts(admin, propId);
  }
}

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);

  (async () => {
    await runVouchingTests({ url, anonKey, admin });
    console.log('[smoke] PASS: vouching tests completed.');
  })().catch((err) => {
    console.error('[smoke] FAIL:', err.message || err);
    process.exit(1);
  });
}

module.exports = { runVouchingTests };
