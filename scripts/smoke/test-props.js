/**
 * Props smoke tests.
 * Covers: create props (text optional), tags persistence, feed visibility, profile feed visibility.
 *
 * Run standalone:
 *   node scripts/smoke/test-props.js
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

async function ensureFriendship(clientA, clientB, idA, idB) {
  const { error: insertErr } = await clientA
    .from('friendships')
    .insert({ user_one_id: idA, user_two_id: idB })
    .select('id')
    .single();

  if (insertErr && insertErr.code !== '23505') {
    throw insertErr;
  }

  if (!insertErr) {
    return;
  }

  const { data, error: lookupErr } = await clientB
    .from('friendships')
    .select('id')
    .or(`and(user_one_id.eq.${idA},user_two_id.eq.${idB}),and(user_one_id.eq.${idB},user_two_id.eq.${idA})`)
    .maybeSingle();

  if (lookupErr) {
    throw lookupErr;
  }

  assert(data?.id, 'Friendship should exist before props tests run.');
}

function parseTags(category) {
  if (!category) {
    return [];
  }

  return String(category)
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function runPropsTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;

  await runTest('props: ensure friendship exists', async () => {
    await ensureFriendship(clientA, clientB, idA, idB);
  });

  await runTest('props: create with text + tags (A -> B)', async () => {
    const { data, error } = await clientA
      .from('props_entries')
      .insert({
        from_user_id: idA,
        to_user_id: idB,
        content: 'Starkes Pairing heute',
        category: 'teamwork||support',
      })
      .select('id, from_user_id, to_user_id, content, category')
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.from_user_id, idA, 'from_user_id mismatch');
    assertEqual(data.to_user_id, idB, 'to_user_id mismatch');
    assertEqual(data.content, 'Starkes Pairing heute', 'content mismatch');

    const tags = parseTags(data.category);
    assert(tags.includes('teamwork'), 'teamwork tag missing');
    assert(tags.includes('support'), 'support tag missing');
  });

  await runTest('props: create with optional text (empty content) + tag (B -> A)', async () => {
    const { data, error } = await clientB
      .from('props_entries')
      .insert({
        from_user_id: idB,
        to_user_id: idA,
        content: '',
        category: 'quickhelp',
      })
      .select('id, content, category')
      .single();

    if (error) {
      throw error;
    }

    assertEqual(data.content, '', 'empty content expected');
    const tags = parseTags(data.category);
    assert(tags.includes('quickhelp'), 'quickhelp tag missing');
  });

  await runTest('props: feed visibility (A sees own friend connection props)', async () => {
    const { data, error } = await clientA
      .from('props_entries')
      .select('id, from_user_id, to_user_id')
      .or(`and(from_user_id.eq.${idA},to_user_id.eq.${idB}),and(from_user_id.eq.${idB},to_user_id.eq.${idA})`);

    if (error) {
      throw error;
    }

    assert((data || []).length >= 2, 'Expected at least two props entries in feed scope.');
  });

  await runTest('props: profile feed visibility (B collected props)', async () => {
    const { data, error } = await clientB
      .from('props_entries')
      .select('id, from_user_id, to_user_id, content, category')
      .eq('to_user_id', idB)
      .eq('from_user_id', idA);

    if (error) {
      throw error;
    }

    assert((data || []).length >= 1, 'Expected profile feed entry for user B.');
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
      await runPropsTests(ctx);
      console.log('[smoke] PASS: props tests completed.');
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

module.exports = { runPropsTests };
