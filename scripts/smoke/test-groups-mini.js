/**
 * Groups mini smoke tests (low-load, issue #13).
 *
 * Run:
 *   node scripts/smoke/test-groups-mini.js
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

async function cleanupGroupsData(admin, userIds) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) {
    return;
  }

  await admin.from('group_props_links').delete().in('linked_by', ids);
  await admin.from('group_invites').delete().or(
    `inviter_id.in.(${ids.join(',')}),invitee_id.in.(${ids.join(',')})`
  );
  await admin.from('group_memberships').delete().in('user_id', ids);
  await admin.from('groups').delete().in('created_by', ids);
}

async function runGroupsMiniTests(ctx) {
  const { clientA, clientB, loginA, loginB } = ctx;
  const idA = loginA.user.id;
  const idB = loginB.user.id;

  let group;
  let invite;
  let prop;

  await runTest('groups-mini: create group and owner bootstrap', async () => {
    const { data: groupRow, error: groupErr } = await clientA
      .from('groups')
      .insert({
        name: `Smoke Group ${ctx.runId.slice(-6)}`,
        description: 'Issue #13 low-load smoke',
        cover_image_url: null,
        created_by: idA,
      })
      .select('id, name, created_by, cover_image_url')
      .single();

    if (groupErr) {
      throw groupErr;
    }

    const { data: ownerMembership, error: ownerErr } = await clientA
      .from('group_memberships')
      .insert({
        group_id: groupRow.id,
        user_id: idA,
        role: 'owner',
      })
      .select('group_id, user_id, role')
      .single();

    if (ownerErr) {
      throw ownerErr;
    }

    assertEqual(groupRow.created_by, idA, 'Group creator mismatch');
    assertEqual(ownerMembership.role, 'owner', 'Creator must be owner');
    group = groupRow;
  });

  await runTest('groups-mini: owner can invite, member cannot invite', async () => {
    const { data: inviteRow, error: inviteErr } = await clientA
      .from('group_invites')
      .insert({
        group_id: group.id,
        inviter_id: idA,
        invitee_id: idB,
        status: 'pending',
      })
      .select('id, group_id, inviter_id, invitee_id, status')
      .single();

    if (inviteErr) {
      throw inviteErr;
    }

    const { error: forbiddenInviteErr } = await clientB
      .from('group_invites')
      .insert({
        group_id: group.id,
        inviter_id: idB,
        invitee_id: idA,
        status: 'pending',
      })
      .select('id')
      .single();

    assert(forbiddenInviteErr, 'Non-owner invite should be blocked by RLS');
    assertEqual(inviteRow.status, 'pending', 'Invite must start as pending');
    invite = inviteRow;
  });

  await runTest('groups-mini: invite acceptance creates membership and is idempotent-safe', async () => {
    const nowIso = new Date().toISOString();

    const { data: acceptedInvite, error: acceptErr } = await clientB
      .from('group_invites')
      .update({ status: 'accepted', responded_at: nowIso })
      .eq('id', invite.id)
      .eq('invitee_id', idB)
      .eq('status', 'pending')
      .select('id, status, responded_at')
      .single();

    if (acceptErr) {
      throw acceptErr;
    }

    const { data: memberRow, error: memberErr } = await clientA
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: idB,
        role: 'member',
      })
      .select('group_id, user_id, role')
      .single();

    if (memberErr) {
      throw memberErr;
    }

    const { data: secondAccept, error: secondAcceptErr } = await clientB
      .from('group_invites')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', invite.id)
      .eq('invitee_id', idB)
      .eq('status', 'pending')
      .select('id, status');

    assertEqual(acceptedInvite.status, 'accepted', 'Invite should be accepted');
    assert(memberRow.user_id === idB, 'Membership for invitee expected');
    assert(!secondAcceptErr, 'Second accept query should not hard-fail');
    assert((secondAccept || []).length === 0, 'Second accept should affect no rows');
  });

  await runTest('groups-mini: member list visible to members, hidden from non-members', async () => {
    const { data: ownerView, error: ownerViewErr } = await clientA
      .from('group_memberships')
      .select('user_id, role')
      .eq('group_id', group.id);

    if (ownerViewErr) {
      throw ownerViewErr;
    }

    const { data: memberView, error: memberViewErr } = await clientB
      .from('group_memberships')
      .select('user_id, role')
      .eq('group_id', group.id);

    if (memberViewErr) {
      throw memberViewErr;
    }

    const outsider = ctx.clientOutside || ctx.clientC || null;
    if (outsider) {
      const { data: outsiderView, error: outsiderErr } = await outsider
        .from('group_memberships')
        .select('user_id, role')
        .eq('group_id', group.id);
      assert(!outsiderErr, 'Outsider query should be policy-filtered, not crash');
      assert((outsiderView || []).length === 0, 'Outsider should not see memberships');
    }

    assert((ownerView || []).length >= 2, 'Owner should see full membership list');
    assert((memberView || []).length >= 2, 'Member should see full membership list');
  });

  await runTest('groups-mini: props link unique and member-bound', async () => {
    const { error: friendshipErr } = await clientA
      .from('friendships')
      .insert({ user_one_id: idA, user_two_id: idB })
      .select('id')
      .single();

    if (friendshipErr && friendshipErr.code !== '23505') {
      throw friendshipErr;
    }

    const { data: propRow, error: propErr } = await clientA
      .from('props_entries')
      .insert({
        from_user_id: idA,
        to_user_id: idB,
        content: 'Group props link smoke',
        category: 'group-check',
      })
      .select('id')
      .single();

    if (propErr) {
      throw propErr;
    }

    const { data: linkRow, error: linkErr } = await clientB
      .from('group_props_links')
      .insert({
        group_id: group.id,
        prop_id: propRow.id,
        linked_by: idB,
      })
      .select('id, group_id, prop_id, linked_by')
      .single();

    if (linkErr) {
      throw linkErr;
    }

    const { error: dupErr } = await clientA
      .from('group_props_links')
      .insert({
        group_id: group.id,
        prop_id: propRow.id,
        linked_by: idA,
      })
      .select('id')
      .single();

    assert(dupErr, 'Duplicate group/prop link should be blocked by unique constraint');
    assertEqual(linkRow.group_id, group.id, 'Link group mismatch');
    prop = propRow;
  });

  void prop;
}

if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  (async () => {
    try {
      console.log('[smoke-groups-mini] low-load mode: 5 group integration checks');
      ctx = await provisionSmokeUsers(admin, url, anonKey);
      await runGroupsMiniTests(ctx);
      console.log('[smoke-groups-mini] PASS: groups mini tests completed.');
    } finally {
      if (ctx?.userIds) {
        await cleanupGroupsData(admin, ctx.userIds);
        await ensureAuthUsersDeleted(admin, ctx.userIds);
      }
    }
  })().catch((err) => {
    console.error('[smoke-groups-mini] FAIL:', err.message || err);
    process.exitCode = 1;
  });
}

module.exports = { runGroupsMiniTests };
