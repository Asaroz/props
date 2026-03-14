import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  listGroupsForUser,
  listIncomingGroupInvites,
  respondToGroupInvite,
} from '../backend/services';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { palette } from '../theme/colors';

function toSafeErrorMessage(fallbackMessage) {
  return fallbackMessage;
}

function profileLabel(profile, fallback) {
  const displayName = String(profile?.displayName || '').trim();
  const username = String(profile?.username || '').trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `${displayName} (@${username})`;
  }

  if (displayName || username) {
    return displayName || username;
  }

  return fallback || 'Unknown user';
}

export default function GroupsHubScreen({ currentUser, onBack, onNavigate }) {
  const [groups, setGroups] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRespondingInviteId, setIsRespondingInviteId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadHubData = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const [groupsData, invitesData] = await Promise.all([
        listGroupsForUser(currentUser),
        listIncomingGroupInvites(currentUser),
      ]);

      setGroups(groupsData || []);
      setIncomingInvites(invitesData || []);
    } catch (_loadError) {
      setError(toSafeErrorMessage('Groups data could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadHubData();
  }, [loadHubData]);

  async function handleInviteResponse(inviteId, action) {
    setIsRespondingInviteId(inviteId);
    setError('');
    setNotice('');

    try {
      await respondToGroupInvite(currentUser, inviteId, action);
      setNotice(action === 'accept' ? 'Invite accepted.' : 'Invite rejected.');
      await loadHubData();
    } catch (_responseError) {
      setError(toSafeErrorMessage('Invite response failed.'));
    } finally {
      setIsRespondingInviteId('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>Groups Hub</Text>
          <Text style={styles.subtitle}>Welcome, {currentUser.displayName || currentUser.email}</Text>
        </View>
      </View>

      <View style={styles.quickActionsRow}>
        <Pressable style={styles.quickActionItem} onPress={() => onNavigate('groupList')}>
          <PlaceholderCard
            title="My Groups"
            caption={groups.length ? `${groups.length} linked groups` : 'Open full list'}
          />
        </Pressable>
        <Pressable style={styles.quickActionItem} onPress={() => onNavigate('createGroup')}>
          <PlaceholderCard title="Create Group" caption="Start a new group" />
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Your Groups ({groups.length})</Text>
          <Pressable style={styles.refreshButton} onPress={() => onNavigate('groupList')}>
            <Text style={styles.refreshButtonText}>See all</Text>
          </Pressable>
        </View>

        {isLoading ? <ActivityIndicator size="small" color={palette.accent} style={styles.loadingIndicator} /> : null}

        {!isLoading && !groups.length ? (
          <Text style={styles.emptyText}>You are not linked to any groups yet.</Text>
        ) : null}

        {groups.slice(0, 4).map((group) => (
          <Pressable
            key={group.id}
            style={styles.groupRow}
            onPress={() => onNavigate('groupDetail', { groupId: group.id })}
          >
            <View style={styles.groupRowMain}>
              <Text style={styles.groupRowTitle}>{group.name}</Text>
              <Text style={styles.groupRowMeta}>
                {group.viewerRole || 'member'} | {group.memberCount || 0} members
              </Text>
            </View>
            <Text style={styles.groupRowCta}>Open</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Incoming Invites ({incomingInvites.length})</Text>
          <Pressable style={styles.refreshButton} onPress={loadHubData} disabled={isLoading}>
            <Text style={styles.refreshButtonText}>{isLoading ? 'Loading...' : 'Reload'}</Text>
          </Pressable>
        </View>

        {isLoading ? <ActivityIndicator size="small" color={palette.accent} style={styles.loadingIndicator} /> : null}

        {!isLoading && !incomingInvites.length ? (
          <Text style={styles.emptyText}>No pending group invites.</Text>
        ) : null}

        {incomingInvites.map((invite) => {
          const inviterText = profileLabel(invite.inviterProfile, invite.inviterId);
          const groupName = invite.group?.name || invite.groupId;
          const isBusy = isRespondingInviteId === invite.id;

          return (
            <View key={invite.id} style={styles.inviteRow}>
              <Text style={styles.inviteTitle}>{groupName}</Text>
              <Text style={styles.inviteMeta}>From: {inviterText}</Text>
              <View style={styles.inviteActions}>
                <Pressable
                  style={[styles.actionButton, styles.acceptButton]}
                  onPress={() => handleInviteResponse(invite.id, 'accept')}
                  disabled={isBusy}
                >
                  <Text style={styles.actionButtonText}>{isBusy ? '...' : 'Accept'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => handleInviteResponse(invite.id, 'reject')}
                  disabled={isBusy}
                >
                  <Text style={styles.actionButtonText}>{isBusy ? '...' : 'Reject'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>MVP Scope Notes</Text>
        <Text style={styles.scopeText}>- Group list and details are scaffold-level in this first cut.</Text>
        <Text style={styles.scopeText}>- Create flow is functional with owner bootstrap via DB trigger.</Text>
        <Text style={styles.scopeText}>- Invite accept/reject updates invite status with baseline feedback.</Text>
        <Text style={styles.scopeText}>- Invite acceptance now bootstraps membership through backend trigger logic.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  backButton: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backButtonText: {
    color: palette.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  quickActionItem: {
    flex: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.card,
    padding: 12,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshButtonText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  loadingIndicator: {
    marginBottom: 10,
  },
  inviteRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  groupRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  groupRowMain: {
    flex: 1,
  },
  groupRowTitle: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  groupRowMeta: {
    color: palette.textSecondary,
    fontSize: 11,
  },
  groupRowCta: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  inviteTitle: {
    color: palette.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  inviteMeta: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  acceptButton: {
    backgroundColor: '#1E5E2E',
  },
  rejectButton: {
    backgroundColor: '#B00020',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scopeText: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 12,
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