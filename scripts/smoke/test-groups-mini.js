/**
 * Groups mini smoke tests (low-load, issue #13).
 *
 * Run:
 *   node scripts/smoke/test-groups-mini.js
 */

const {
  requireEnv,
  createAdminClient,
  createAnonClient,
  runTest,
  assert,
  assertEqual,
  findAuthUserByEmail,
  provisionSmokeUsers,
  ensureAuthUsersDeleted,
} = require('./helpers');

async function provisionOutsiderClient(admin, url, anonKey, runId) {
  const password = 'SmokeTest_123456';
  const email = `smokec${runId}@examplemail.com`;

  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr && createErr.code !== 'email_exists') {
    throw createErr;
  }

  const outsider = await findAuthUserByEmail(admin, email);
  assert(outsider?.id, 'Outsider user was not found in auth.users after provisioning.');

  const clientOutside = createAnonClient(url, anonKey);
  const { data: loginOutside, error: loginOutsideErr } = await clientOutside.auth.signInWithPassword({
    email,
    password,
  });

  if (loginOutsideErr) {
    throw loginOutsideErr;
  }

  return {
    clientOutside,
    loginOutside,
    outsiderUserId: outsider.id,
  };
}

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
  let otherGroup;
  let invite;
  let memberInvite;
  let rejectedInvite;
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
      .select('group_id, user_id, role')
      .eq('group_id', groupRow.id)
      .eq('user_id', idA)
      .maybeSingle();

    if (ownerErr) {
      throw ownerErr;
    }

    assert(ownerMembership, 'Creator owner membership should be auto-created');

    const { data: duplicateOwner, error: duplicateOwnerErr } = await clientA
      .from('group_memberships')
      .insert({
        group_id: groupRow.id,
        user_id: idA,
        role: 'owner',
      })
      .select('group_id, user_id, role')
      .single();

    assert(duplicateOwnerErr, 'Duplicate owner membership insert should be blocked');
    void duplicateOwner;

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

  await runTest('groups-mini: only owner can update group settings', async () => {
    const { data: ownerUpdatedGroup, error: ownerUpdateErr } = await clientA
      .from('groups')
      .update({
        description: 'Issue #16 owner-managed settings',
      })
      .eq('id', group.id)
      .select('id, description, invite_permission')
      .single();

    if (ownerUpdateErr) {
      throw ownerUpdateErr;
    }

    const { error: memberUpdateErr } = await clientB
      .from('groups')
      .update({
        description: 'Issue #15 forbidden member update',
      })
      .eq('id', group.id)
      .select('id')
      .single();

    assert(memberUpdateErr, 'Non-owner group settings update should be blocked by RLS');
    assertEqual(ownerUpdatedGroup.description, 'Issue #16 owner-managed settings', 'Owner settings update mismatch');
    assertEqual(ownerUpdatedGroup.invite_permission, 'owner_only', 'New groups must default to owner-only invites');
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

  await runTest('groups-mini: owner can enable member invites and invitee can reject', async () => {
    assert(ctx.outsiderUserId, 'Outsider user id is required for member-invite checks');

    const { data: toggledGroup, error: toggleErr } = await clientA
      .from('groups')
      .update({ invite_permission: 'member_invite' })
      .eq('id', group.id)
      .select('id, invite_permission')
      .single();

    if (toggleErr) {
      throw toggleErr;
    }

    assertEqual(toggledGroup.invite_permission, 'member_invite', 'Owner should be able to allow member invites');

    const { data: memberInviteRow, error: memberInviteErr } = await clientB
      .from('group_invites')
      .insert({
        group_id: group.id,
        inviter_id: idB,
        invitee_id: ctx.outsiderUserId,
        status: 'pending',
      })
      .select('id, group_id, inviter_id, invitee_id, status')
      .single();

    if (memberInviteErr) {
      throw memberInviteErr;
    }

    const nowIso = new Date().toISOString();
    const { data: rejectedRow, error: rejectErr } = await ctx.clientOutside
      .from('group_invites')
      .update({ status: 'rejected', responded_at: nowIso })
      .eq('id', memberInviteRow.id)
      .eq('invitee_id', ctx.outsiderUserId)
      .eq('status', 'pending')
      .select('id, status, responded_at')
      .single();

    if (rejectErr) {
      throw rejectErr;
    }

    assertEqual(memberInviteRow.status, 'pending', 'Member-created invite should start pending');
    assertEqual(rejectedRow.status, 'rejected', 'Invitee should be able to reject pending invite');
    memberInvite = memberInviteRow;
    rejectedInvite = rejectedRow;
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

  await runTest('groups-mini: only owner can manage member roles and removals', async () => {
    assert(ctx.outsiderUserId, 'Outsider user id is required for owner/member management checks');

    const { data: outsiderMembership, error: outsiderInsertErr } = await clientA
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: ctx.outsiderUserId,
        role: 'member',
      })
      .select('group_id, user_id, role')
      .single();

    if (outsiderInsertErr) {
      throw outsiderInsertErr;
    }

    const { error: nonOwnerInsertMemberErr } = await clientB
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: ctx.outsiderUserId,
        role: 'member',
      })
      .select('group_id, user_id, role')
      .single();

    assert(nonOwnerInsertMemberErr, 'Non-owner member insert should be blocked by RLS');

    const { error: nonOwnerInsertOwnerErr } = await clientB
      .from('group_memberships')
      .insert({
        group_id: group.id,
        user_id: idB,
        role: 'owner',
      })
      .select('group_id, user_id, role')
      .single();

    assert(nonOwnerInsertOwnerErr, 'Non-owner owner insert should be blocked by RLS');

    const { error: nonOwnerRoleEscalationErr } = await clientB
      .from('group_memberships')
      .update({ role: 'owner' })
      .eq('group_id', group.id)
      .eq('user_id', ctx.outsiderUserId)
      .select('group_id, user_id, role')
      .single();

    assert(nonOwnerRoleEscalationErr, 'Non-owner role update should be blocked by RLS');

    const { error: nonOwnerOwnerEscalationErr } = await clientB
      .from('group_memberships')
      .update({ role: 'owner' })
      .eq('group_id', group.id)
      .eq('user_id', idB)
      .select('group_id, user_id, role')
      .single();

    assert(nonOwnerOwnerEscalationErr, 'Member self-escalation to owner should be blocked by RLS');

    const { error: nonOwnerDeleteMemberErr } = await clientB
      .from('group_memberships')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', ctx.outsiderUserId)
      .select('group_id, user_id')
      .single();

    assert(nonOwnerDeleteMemberErr, 'Non-owner member removal should be blocked by RLS');

    const { data: ownerDeleteRows, error: ownerDeleteErr } = await clientA
      .from('group_memberships')
      .delete()
      .eq('group_id', group.id)
      .eq('user_id', ctx.outsiderUserId)
      .select('group_id, user_id');

    if (ownerDeleteErr) {
      throw ownerDeleteErr;
    }

    assertEqual((ownerDeleteRows || []).length, 1, 'Owner should be able to remove non-owner members');
    assertEqual(outsiderMembership.role, 'member', 'Inserted outsider membership role mismatch');
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

  await runTest('groups-mini: cross-group read/write isolation is enforced', async () => {
    const { data: otherGroupRow, error: otherGroupErr } = await clientB
      .from('groups')
      .insert({
        name: `Smoke Group B ${ctx.runId.slice(-6)}`,
        description: 'Issue #14 cross-group isolation smoke',
        cover_image_url: null,
        created_by: idB,
      })
      .select('id, created_by')
      .single();

    if (otherGroupErr) {
      throw otherGroupErr;
    }

    otherGroup = otherGroupRow;

    const { data: readBlockedRows, error: readBlockedErr } = await clientA
      .from('group_memberships')
      .select('user_id, role')
      .eq('group_id', otherGroup.id);

    assert(!readBlockedErr, 'Cross-group membership query should be policy-filtered, not crash');
    assertEqual((readBlockedRows || []).length, 0, 'Non-member must not read other group memberships');

    const { data: hiddenGroupRows, error: hiddenGroupErr } = await clientA
      .from('groups')
      .select('id, name')
      .eq('id', otherGroup.id);

    assert(!hiddenGroupErr, 'Cross-group group query should be policy-filtered, not crash');
    assertEqual((hiddenGroupRows || []).length, 0, 'Non-member must not read other group details');

    const { error: writeBlockedErr } = await clientA
      .from('group_props_links')
      .insert({
        group_id: otherGroup.id,
        prop_id: prop.id,
        linked_by: idA,
      })
      .select('id')
      .single();

    assert(writeBlockedErr, 'Non-member must not write links into another group');
  });

  void prop;
  void otherGroup;
  void memberInvite;
  void rejectedInvite;
}

if (require.main === module) {
  const { url, anonKey, serviceRoleKey } = requireEnv();
  const admin = createAdminClient(url, serviceRoleKey);
  let ctx;

  (async () => {
    try {
      console.log('[smoke-groups-mini] low-load mode: 9 group integration checks');
      ctx = await provisionSmokeUsers(admin, url, anonKey);
      const outsider = await provisionOutsiderClient(admin, url, anonKey, ctx.runId);
      ctx = {
        ...ctx,
        ...outsider,
        userIds: [...ctx.userIds, outsider.outsiderUserId],
      };
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
