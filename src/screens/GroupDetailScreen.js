import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  addVouch,
  getFriendProfiles,
  getGroupDetail,
  listGroupInvitesForGroup,
  removeVouch,
  sendGroupInviteByDisplayName,
} from '../backend/services';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { palette } from '../theme/colors';

function toSafeErrorMessage(fallbackMessage) {
  return fallbackMessage;
}

function profileLabel(profile, fallbackId) {
  const displayName = String(profile?.displayName || '').trim();
  const username = String(profile?.username || '').trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `${displayName} (@${username})`;
  }

  if (displayName || username) {
    return displayName || username;
  }

  return fallbackId ? `User ${String(fallbackId).slice(0, 8)}` : 'Unknown user';
}

function toDisplayDate(value) {
  if (!value) {
    return 'Now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function friendSuggestionLabel(profile) {
  const displayName = String(profile?.displayName || '').trim();
  const username = String(profile?.username || '').trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `${displayName} (@${username})`;
  }

  return displayName || username || `User ${String(profile?.id || '').slice(0, 8)}`;
}

export default function GroupDetailScreen({ currentUser, params, onBack, onNavigate }) {
  const groupId = String(params?.groupId || '').trim();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [feedEntries, setFeedEntries] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [friendSuggestions, setFriendSuggestions] = useState([]);

  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [isSendingSuggestedInviteId, setIsSendingSuggestedInviteId] = useState('');
  const [isMutatingVouchId, setIsMutatingVouchId] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewerRole, setViewerRole] = useState('member');
  const [activeSection, setActiveSection] = useState('feed');

  const isOwner = viewerRole === 'owner';

  const loadGroup = useCallback(async () => {
    if (!groupId) {
      setError('Group id is missing.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const detail = await getGroupDetail(currentUser, groupId);
      const [invites, friends] = detail?.viewerRole === 'owner'
        ? await Promise.all([
            listGroupInvitesForGroup(currentUser, groupId),
            getFriendProfiles(currentUser),
          ])
        : [[], []];

      const ownerInvites =
        detail?.viewerRole === 'owner'
          ? invites
          : [];

      const memberUserIds = new Set((detail.members || []).map((member) => member.userId).filter(Boolean));
      const pendingInviteeIds = new Set(
        (ownerInvites || [])
          .filter((invite) => invite.status === 'pending')
          .map((invite) => invite.inviteeId)
          .filter(Boolean)
      );

      const suggestions = (friends || []).filter((friend) => {
        if (!friend?.id) {
          return false;
        }

        if (!String(friend.displayName || '').trim()) {
          return false;
        }

        if (memberUserIds.has(friend.id)) {
          return false;
        }

        if (pendingInviteeIds.has(friend.id)) {
          return false;
        }

        return true;
      });

      setGroup(detail.group || null);
      setMembers(detail.members || []);
      setFeedEntries(detail.feed || []);
      setViewerRole(detail.viewerRole || 'member');
      setPendingInvites(ownerInvites || []);
      setFriendSuggestions(suggestions);
    } catch (_loadError) {
      setError(toSafeErrorMessage('Group details could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, groupId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const leaderboard = useMemo(() => {
    const scoreByUserId = {};

    for (const entry of feedEntries) {
      if (!entry.toUserId) {
        continue;
      }

      scoreByUserId[entry.toUserId] = (scoreByUserId[entry.toUserId] || 0) + (entry.vouchCount || 0);
    }

    return Object.entries(scoreByUserId)
      .map(([userId, score]) => {
        const member = members.find((item) => item.userId === userId) || null;
        return {
          userId,
          score,
          label: profileLabel(member?.profile, userId),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [feedEntries, members]);

  const sectionTabs = useMemo(() => {
    const baseTabs = [
      { key: 'feed', label: 'Feed', count: feedEntries.length },
      { key: 'members', label: 'Members', count: members.length },
      { key: 'leaderboard', label: 'Leaderboard', count: leaderboard.length },
    ];

    if (isOwner) {
      baseTabs.push({ key: 'invites', label: 'Invites', count: pendingInvites.length });
    }

    return baseTabs;
  }, [feedEntries.length, isOwner, leaderboard.length, members.length, pendingInvites.length]);

  async function handleSendInvite() {
    const normalizedDisplayName = inviteDisplayName.trim();
    if (!normalizedDisplayName) {
      setError('Display name is required.');
      return;
    }

    setIsSendingInvite(true);
    setError('');
    setNotice('');

    try {
      await sendGroupInviteByDisplayName(currentUser, groupId, normalizedDisplayName);
      setInviteDisplayName('');
      setNotice('Invite sent.');
      await loadGroup();
    } catch (_inviteError) {
      setError(toSafeErrorMessage('Invite could not be sent.'));
    } finally {
      setIsSendingInvite(false);
    }
  }

  async function handleToggleVouch(entry) {
    const entryId = String(entry?.id || '').trim();
    if (!entryId) {
      return;
    }

    setIsMutatingVouchId(entryId);
    setError('');
    setNotice('');

    try {
      if (entry.hasVouched) {
        await removeVouch(currentUser, entryId);
      } else {
        await addVouch(currentUser, entryId);
      }

      await loadGroup();
    } catch (_vouchError) {
      setError(toSafeErrorMessage('Vouch action failed.'));
    } finally {
      setIsMutatingVouchId('');
    }
  }

  async function handleInviteSuggestedFriend(friendProfile) {
    const displayName = String(friendProfile?.displayName || '').trim();
    if (!displayName) {
      setError('This friend has no display name set.');
      return;
    }

    setIsSendingSuggestedInviteId(friendProfile.id || '');
    setError('');
    setNotice('');

    try {
      await sendGroupInviteByDisplayName(currentUser, groupId, displayName);
      setNotice(`Invite sent to ${displayName}.`);
      await loadGroup();
    } catch (_inviteError) {
      setError(toSafeErrorMessage('Invite could not be sent.'));
    } finally {
      setIsSendingSuggestedInviteId('');
    }
  }

  if (!groupId) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>Group id is missing.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{group?.name || 'Group'}</Text>
          <Text style={styles.subtitle}>Role: {viewerRole}</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={loadGroup} disabled={isLoading}>
          <Text style={styles.refreshButtonText}>{isLoading ? 'Loading...' : 'Reload'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

      <View style={styles.coverCard}>
        <Text style={styles.sectionTitle}>Group Cover</Text>
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderText}>
            {group?.coverImageUrl ? 'Cover image configured' : 'No cover image set (placeholder)'}
          </Text>
        </View>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() =>
          onNavigate('giveProps', {
            groupId,
            groupName: group?.name || '',
            returnTo: 'groupDetail',
            returnParams: { groupId },
          })
        }
      >
        <Text style={styles.primaryButtonText}>Give Props In Group</Text>
      </Pressable>

      <View style={styles.sectionTabsRow}>
        {sectionTabs.map((tab) => {
          const isActive = activeSection === tab.key;

          return (
            <Pressable
              key={tab.key}
              style={[styles.sectionTabButton, isActive ? styles.sectionTabButtonActive : null]}
              onPress={() => setActiveSection(tab.key)}
            >
              <Text style={[styles.sectionTabButtonText, isActive ? styles.sectionTabButtonTextActive : null]}>
                {tab.label}
              </Text>
              <View style={[styles.sectionTabBadge, isActive ? styles.sectionTabBadgeActive : null]}>
                <Text style={[styles.sectionTabBadgeText, isActive ? styles.sectionTabBadgeTextActive : null]}>
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {activeSection === 'feed' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Feed</Text>

          {isLoading ? <ActivityIndicator size="small" color={palette.accent} style={styles.loadingIndicator} /> : null}

          {!isLoading && !feedEntries.length ? (
            <PlaceholderCard
              title="No group props yet"
              caption="Create or link a props entry in group context."
            />
          ) : null}

          {feedEntries.map((entry) => {
            const fromLabel = profileLabel(entry.fromProfile, entry.fromUserId);
            const toLabel = profileLabel(entry.toProfile, entry.toUserId);
            const isBusy = isMutatingVouchId === entry.id;
            const buttonText = entry.hasVouched ? 'Remove Vouch' : 'Vouch';

            return (
              <View key={entry.id} style={styles.feedRow}>
                <Text style={styles.feedTitle}>{fromLabel} -> {toLabel}</Text>
                <Text style={styles.feedContent}>{entry.content || 'Props entry without text.'}</Text>
                <Text style={styles.feedMeta}>Vouches: {entry.vouchCount || 0} | {toDisplayDate(entry.createdAt)}</Text>
                <Pressable
                  style={[styles.inlineButton, entry.hasVouched ? styles.secondaryButton : styles.primaryInlineButton]}
                  onPress={() => handleToggleVouch(entry)}
                  disabled={isBusy}
                >
                  <Text style={styles.inlineButtonText}>{isBusy ? '...' : buttonText}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {activeSection === 'members' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          {!members.length ? <Text style={styles.emptyText}>No visible members.</Text> : null}
          {members.map((member) => (
            <Text key={member.id} style={styles.memberRowText}>
              {profileLabel(member.profile, member.userId)} ({member.role})
            </Text>
          ))}
        </View>
      ) : null}

      {activeSection === 'leaderboard' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Leaderboard</Text>
          {!leaderboard.length ? <Text style={styles.emptyText}>No vouches in this group yet.</Text> : null}
          {leaderboard.map((item, index) => (
            <Text key={item.userId} style={styles.memberRowText}>
              {index + 1}. {item.label}: {item.score}
            </Text>
          ))}
        </View>
      ) : null}

      {isOwner && activeSection === 'invites' ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Invite Members</Text>
          <TextInput
            style={styles.input}
            value={inviteDisplayName}
            onChangeText={setInviteDisplayName}
            placeholder="Display name"
            placeholderTextColor={palette.textSecondary}
          />
          <Pressable
            style={styles.primaryButton}
            onPress={handleSendInvite}
            disabled={isSendingInvite}
          >
            <Text style={styles.primaryButtonText}>{isSendingInvite ? 'Sending...' : 'Send Invite'}</Text>
          </Pressable>

          <Text style={styles.pendingTitle}>Friend Suggestions ({friendSuggestions.length})</Text>
          {!friendSuggestions.length ? (
            <Text style={styles.emptyText}>No friend suggestions available.</Text>
          ) : null}
          {friendSuggestions.map((friend) => {
            const isBusy = isSendingSuggestedInviteId === friend.id;
            return (
              <View key={friend.id} style={styles.suggestionRow}>
                <Text style={styles.memberRowText}>{friendSuggestionLabel(friend)}</Text>
                <Pressable
                  style={[styles.inlineButton, styles.primaryInlineButton]}
                  onPress={() => handleInviteSuggestedFriend(friend)}
                  disabled={isBusy}
                >
                  <Text style={styles.inlineButtonText}>{isBusy ? '...' : 'Invite'}</Text>
                </Pressable>
              </View>
            );
          })}

          <Text style={styles.pendingTitle}>Pending Invites ({pendingInvites.length})</Text>
          {!pendingInvites.length ? <Text style={styles.emptyText}>No pending invites for this group.</Text> : null}
          {pendingInvites.map((invite) => (
            <Text key={invite.id} style={styles.memberRowText}>
              {profileLabel(invite.inviteeProfile, invite.inviteeId)} invited by{' '}
              {profileLabel(invite.inviterProfile, invite.inviterId)}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  backButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    backgroundColor: palette.card,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backButtonText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  sectionTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  sectionTabButton: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTabButtonActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  sectionTabButtonText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTabButtonTextActive: {
    color: '#FFFFFF',
  },
  sectionTabBadge: {
    minWidth: 20,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.accent,
  },
  sectionTabBadgeActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  sectionTabBadgeText: {
    color: palette.accent,
    fontSize: 10,
    fontWeight: '800',
  },
  sectionTabBadgeTextActive: {
    color: palette.accent,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  coverCard: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  coverPlaceholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
  },
  coverPlaceholderText: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  loadingIndicator: {
    marginBottom: 8,
  },
  feedRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 8,
  },
  suggestionRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  feedTitle: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  feedContent: {
    color: palette.textPrimary,
    fontSize: 12,
    marginBottom: 4,
  },
  feedMeta: {
    color: palette.textSecondary,
    fontSize: 11,
    marginBottom: 6,
  },
  memberRowText: {
    color: palette.textPrimary,
    fontSize: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: palette.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  pendingTitle: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  primaryInlineButton: {
    backgroundColor: '#1E5E2E',
  },
  secondaryButton: {
    backgroundColor: '#B00020',
  },
  inlineButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  errorText: {
    color: '#B00020',
    fontSize: 12,
    marginBottom: 10,
  },
  noticeText: {
    color: '#1E5E2E',
    fontSize: 12,
    marginBottom: 10,
  },
});