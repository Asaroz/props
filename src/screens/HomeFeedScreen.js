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
  removeVouch,
  getCurrentProfile,
  getFriendProfiles,
  listIncomingFriendRequests,
  listFriends,
  listNotifications,
  listProfileProps,
  listPropsFeed,
  markAllNotificationsRead,
  respondToFriendRequest,
  sendFriendRequestByDisplayName,
  updateCurrentProfile,
} from '../backend/services';
import { loadFriendsSnapshot, saveFriendsSnapshot } from '../backend/cache/friendsCache';
import FeedCard from '../components/feed/FeedCard';
import NotificationBell from '../components/common/NotificationBell';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { palette } from '../theme/colors';

function toDisplayDate(value) {
  if (!value) {
    return 'Jetzt';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Jetzt';
  }

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function notificationTypeLabel(type) {
  if (type === 'friend_request_received') {
    return 'hat dir eine Freundschaftsanfrage gesendet';
  }

  if (type === 'friend_request_accepted') {
    return 'hat deine Freundschaftsanfrage angenommen';
  }

  if (type === 'friend_request_rejected') {
    return 'hat deine Freundschaftsanfrage abgelehnt';
  }

  return type;
}

function shortUserLabel(userId) {
  if (!userId) {
    return 'Unknown user';
  }

  return `User ${String(userId).slice(0, 8)}`;
}

function formatFriendLabel(profile, fallbackUserId) {
  const displayName = String(profile?.displayName || '').trim();
  const username = String(profile?.username || '').trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `${displayName} (@${username})`;
  }

  if (displayName || username) {
    return displayName || username;
  }

  return shortUserLabel(fallbackUserId);
}

function mapEntryToFeedCard(entry, currentUserId, friendProfilesMap) {
  const isReceived = entry.toUserId === currentUserId;
  const isSent = entry.fromUserId === currentUserId;
  const fromLabel = formatFriendLabel(friendProfilesMap?.[entry.fromUserId], entry.fromUserId);
  const toLabel = formatFriendLabel(friendProfilesMap?.[entry.toUserId], entry.toUserId);

  let title;
  let location;

  if (isReceived) {
    title = `${fromLabel} -> Du`;
    location = 'Erhalten';
  } else if (isSent) {
    title = `Du -> ${toLabel}`;
    location = 'Gesendet';
  } else {
    title = `${fromLabel} -> ${toLabel}`;
    location = 'Freundeskreis';
  }

  const collectedProps = [];
  if (entry.content) {
    collectedProps.push(entry.content);
  }

  if (Array.isArray(entry.tags) && entry.tags.length) {
    for (const tag of entry.tags) {
      collectedProps.push(`#${tag}`);
    }
  }

  if (!collectedProps.length) {
    collectedProps.push('Props ohne Text');
  }

  return {
    id: entry.id,
    friendName: title,
    location,
    updatedAt: toDisplayDate(entry.createdAt),
    collectedProps,
    vouchCount: entry.vouchCount ?? 0,
    hasVouched: entry.hasVouched ?? false,
  };
}

export default function HomeFeedScreen({ currentUser, onLogout, onNavigate }) {
  const [activePanel, setActivePanel] = useState(null);

  const [profileForm, setProfileForm] = useState({
    displayName: '',
    username: '',
    city: '',
    bio: '',
  });

  const [friendInviteDisplayName, setFriendInviteDisplayName] = useState('');

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isSendingFriendRequest, setIsSendingFriendRequest] = useState(false);

  const [feedEntries, setFeedEntries] = useState([]);
  const [profilePropsEntries, setProfilePropsEntries] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [friendsCacheAt, setFriendsCacheAt] = useState('');

  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [feedError, setFeedError] = useState('');
  const [friendsNotice, setFriendsNotice] = useState('');
  const [friendsError, setFriendsError] = useState('');

  const [notifications, setNotifications] = useState([]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await listNotifications(currentUser);
      setNotifications(data || []);
    } catch (_error) {
      // Notifications are best-effort; silently ignore to avoid blocking the main UI.
    }
  }, [currentUser]);

  const loadFeed = useCallback(async () => {
    setIsLoadingFeed(true);
    setFeedError('');

    try {
      const [feed, ownProfileFeed] = await Promise.all([
        listPropsFeed(currentUser),
        listProfileProps(currentUser, currentUser.id),
      ]);

      setFeedEntries(feed || []);
      setProfilePropsEntries(ownProfileFeed || []);
    } catch (error) {
      setFeedError(error.message || 'Could not load props feed.');
    } finally {
      setIsLoadingFeed(false);
    }
  }, [currentUser]);

  const loadFriendsHub = useCallback(async () => {
    setIsLoadingFriends(true);
    setFriendsError('');

    try {
      const [friendsData, incomingData, friendProfilesData] = await Promise.all([
        listFriends(currentUser),
        listIncomingFriendRequests(currentUser),
        getFriendProfiles(currentUser),
      ]);

      setFriends(friendsData || []);
      setIncomingRequests(incomingData || []);
      setFriendProfiles(friendProfilesData || []);

      const savedAt = new Date().toISOString();
      setFriendsCacheAt(savedAt);
      await saveFriendsSnapshot({
        savedAt,
        friends: friendsData || [],
        incomingRequests: incomingData || [],
      });
    } catch (error) {
      setFriendsError(error.message || 'Could not load friends data.');
    } finally {
      setIsLoadingFriends(false);
    }
  }, [currentUser]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapFriendsCache() {
      const cached = await loadFriendsSnapshot();
      if (!cached || !isMounted) {
        return;
      }

      setFriends(cached.friends || []);
      setIncomingRequests(cached.incomingRequests || []);
      setFriendsCacheAt(cached.savedAt || '');
    }

    bootstrapFriendsCache();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoadingProfile(true);
      setProfileError('');

      try {
        const profile = await getCurrentProfile(currentUser);
        if (!isMounted || !profile) {
          return;
        }

        setProfileForm({
          displayName: profile.displayName || '',
          username: profile.username || '',
          city: profile.city || '',
          bio: profile.bio || '',
        });
      } catch (error) {
        if (isMounted) {
          setProfileError(error.message || 'Could not load your profile.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    loadFeed();
    loadFriendsHub();
  }, [loadFeed, loadFriendsHub]);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const friendProfilesMap = useMemo(() => {
    const map = {};
    for (const profile of friendProfiles) {
      if (profile.id) {
        map[profile.id] = profile;
      }
    }
    return map;
  }, [friendProfiles]);

  function updateField(field, value) {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setProfileNotice('');
    setProfileError('');
  }

  async function handleSaveProfile() {
    if (!profileForm.displayName.trim()) {
      setProfileError('Display name is required.');
      return;
    }

    if (!profileForm.username.trim()) {
      setProfileError('Username is required.');
      return;
    }

    setIsSavingProfile(true);
    setProfileNotice('');
    setProfileError('');

    try {
      const updated = await updateCurrentProfile(currentUser, {
        displayName: profileForm.displayName.trim(),
        username: profileForm.username.trim().toLowerCase(),
        city: profileForm.city.trim(),
        bio: profileForm.bio.trim(),
      });

      setProfileForm({
        displayName: updated.displayName || '',
        username: updated.username || '',
        city: updated.city || '',
        bio: updated.bio || '',
      });
      setProfileNotice('Profile saved successfully.');
    } catch (error) {
      setProfileError(error.message || 'Could not save your profile.');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleSendFriendRequest() {
    const targetDisplayName = friendInviteDisplayName.trim();
    if (!targetDisplayName) {
      setFriendsError('Please enter a display name to invite.');
      return;
    }

    setIsSendingFriendRequest(true);
    setFriendsError('');
    setFriendsNotice('');

    try {
      const result = await sendFriendRequestByDisplayName(currentUser, targetDisplayName);
      setFriendInviteDisplayName('');
      setFriendsNotice(
        `Found ${result.targetUser.displayName}. Friend request sent successfully.`
      );
      await loadFriendsHub();
    } catch (error) {
      setFriendsError(error.message || 'Could not send friend request.');
    } finally {
      setIsSendingFriendRequest(false);
    }
  }

  async function handleRespondToRequest(requestId, action) {
    setFriendsError('');
    setFriendsNotice('');

    try {
      await respondToFriendRequest(currentUser, requestId, action);
      setFriendsNotice(action === 'accept' ? 'Request accepted.' : 'Request rejected.');
      await loadFriendsHub();
      await loadFeed();
    } catch (error) {
      setFriendsError(error.message || 'Could not respond to request.');
    }
  }

  async function handleVouch(propId) {
    try {
      await addVouch(currentUser, propId);
      await loadFeed();
    } catch (error) {
      // Surfaced inline in FeedCard; nothing to propagate here.
    }
  }

  async function handleUnvouch(propId) {
    try {
      await removeVouch(currentUser, propId);
      await loadFeed();
    } catch (error) {
      // Surfaced inline in FeedCard; nothing to propagate here.
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      await markAllNotificationsRead(currentUser);
      await loadNotifications();
    } catch (_error) {
      // Best-effort
    }
  }

  const feedItems = feedEntries.map((entry) => mapEntryToFeedCard(entry, currentUser.id, friendProfilesMap));
  const profileItems = profilePropsEntries.map((entry) => mapEntryToFeedCard(entry, currentUser.id, friendProfilesMap));

  function togglePanel(panelName) {
    setActivePanel((prev) => (prev === panelName ? null : panelName));
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Props</Text>
          <Text style={styles.subtitle}>Welcome, {currentUser.displayName}</Text>
          <Text style={styles.sessionLine}>Signed in as {currentUser.email || currentUser.username}</Text>
        </View>
        <View style={styles.topActions}>
          <NotificationBell
            unreadCount={unreadNotificationCount}
            onPress={() => togglePanel('notifications')}
          />
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.placeholderRow}>
        <Pressable style={styles.placeholderItem} onPress={() => togglePanel('profile')}>
          <PlaceholderCard
            title="Profil"
            caption={activePanel === 'profile' ? 'Profil bearbeiten' : 'Profil oeffnen'}
          />
        </Pressable>
        <Pressable style={styles.placeholderItem} onPress={() => togglePanel('friends')}>
          <PlaceholderCard
            title="Freunde"
            caption={
              activePanel === 'friends'
                ? 'Freunde verwalten'
                : incomingRequests.length
                  ? `${incomingRequests.length} Anfragen offen`
                  : 'Freunde verwalten'
            }
          />
        </Pressable>
        <Pressable style={styles.placeholderItem} onPress={() => onNavigate('giveProps')}>
          <PlaceholderCard title="Neue Props" caption="Props geben" />
        </Pressable>
      </View>

      {activePanel === 'notifications' ? (
        <View style={styles.profileCard}>
          <View style={styles.feedHeadingRow}>
            <Text style={styles.profileTitle}>Benachrichtigungen</Text>
            <Pressable style={styles.refreshButton} onPress={loadNotifications}>
              <Text style={styles.refreshButtonText}>Reload</Text>
            </Pressable>
          </View>

          {unreadNotificationCount > 0 ? (
            <Pressable style={[styles.inlineButton, styles.markAllButton]} onPress={handleMarkAllNotificationsRead}>
              <Text style={styles.inlineButtonText}>Alle als gelesen markieren</Text>
            </Pressable>
          ) : null}

          {!notifications.length ? (
            <Text style={styles.emptyText}>Keine Benachrichtigungen.</Text>
          ) : null}

          {notifications.map((notif) => (
            <View
              key={notif.id}
              style={[styles.requestRow, notif.readAt ? null : styles.unreadRow]}
            >
              <View style={styles.notifTextRow}>
                <Text style={styles.requestText}>
                  {notif.actorDisplayName || 'Jemand'}{' '}
                  {notificationTypeLabel(notif.type)}
                </Text>
                {!notif.readAt ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.metaText}>{toDisplayDate(notif.createdAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activePanel === 'friends' ? (
        <View style={styles.profileCard}>
          <View style={styles.feedHeadingRow}>
            <Text style={styles.profileTitle}>Freunde</Text>
            <Pressable style={styles.refreshButton} onPress={loadFriendsHub} disabled={isLoadingFriends}>
              <Text style={styles.refreshButtonText}>{isLoadingFriends ? 'Loading...' : 'Reload'}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Freund einladen (Display Name)</Text>
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, styles.inlineInput]}
              value={friendInviteDisplayName}
              onChangeText={setFriendInviteDisplayName}
              placeholder="z.B. Lars"
              placeholderTextColor={palette.textSecondary}
            />
            <Pressable style={styles.inlineButton} onPress={handleSendFriendRequest} disabled={isSendingFriendRequest}>
              <Text style={styles.inlineButtonText}>{isSendingFriendRequest ? 'Sende...' : 'Einladen'}</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Offene Anfragen ({incomingRequests.length})</Text>
          {!incomingRequests.length ? <Text style={styles.emptyText}>Keine offenen Anfragen.</Text> : null}
          {incomingRequests.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <Text style={styles.requestText}>
                Von {request.senderDisplayName || shortUserLabel(request.senderId)}
              </Text>
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.inlineButton, styles.acceptButton]}
                  onPress={() => handleRespondToRequest(request.id, 'accept')}
                >
                  <Text style={styles.inlineButtonText}>Annehmen</Text>
                </Pressable>
                <Pressable
                  style={[styles.inlineButton, styles.rejectButton]}
                  onPress={() => handleRespondToRequest(request.id, 'reject')}
                >
                  <Text style={styles.inlineButtonText}>Ablehnen</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Text style={styles.sectionLabel}>Freundesliste ({friends.length})</Text>
          {!friends.length ? <Text style={styles.emptyText}>Noch keine Freunde.</Text> : null}
          {friends.map((friend) => (
            <Text key={friend.id} style={styles.friendRowText}>
              {formatFriendLabel(friendProfilesMap[friend.friendUserId], friend.friendUserId)}
            </Text>
          ))}

          {friendsCacheAt ? <Text style={styles.metaText}>Cache aktualisiert: {toDisplayDate(friendsCacheAt)}</Text> : null}
          <Text style={styles.metaText}>Display Names werden aus den Freundesprofilen geladen.</Text>

          {friendsError ? <Text style={styles.errorText}>{friendsError}</Text> : null}
          {friendsNotice ? <Text style={styles.noticeText}>{friendsNotice}</Text> : null}
        </View>
      ) : null}

      {activePanel === 'profile' ? (
        <View style={styles.profileCard}>
          <Text style={styles.profileTitle}>Dein Profil</Text>

          {isLoadingProfile ? (
            <View style={styles.profileLoadingRow}>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={styles.profileLoadingText}>Profil wird geladen...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={styles.input}
                value={profileForm.displayName}
                onChangeText={(value) => updateField('displayName', value)}
                placeholder="Lars Becker"
                placeholderTextColor={palette.textSecondary}
              />

              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={profileForm.username}
                onChangeText={(value) => updateField('username', value)}
                autoCapitalize="none"
                placeholder="lars"
                placeholderTextColor={palette.textSecondary}
              />

              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                value={profileForm.city}
                onChangeText={(value) => updateField('city', value)}
                placeholder="Berlin"
                placeholderTextColor={palette.textSecondary}
              />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={profileForm.bio}
                onChangeText={(value) => updateField('bio', value)}
                multiline
                placeholder="Tell your friends what you are building."
                placeholderTextColor={palette.textSecondary}
              />

              {profileError ? <Text style={styles.errorText}>{profileError}</Text> : null}
              {profileNotice ? <Text style={styles.noticeText}>{profileNotice}</Text> : null}

              <Pressable
                style={styles.saveButton}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                <Text style={styles.saveButtonText}>
                  {isSavingProfile ? 'Saving...' : 'Save profile'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {activePanel === null ? (
        <>
          <View style={styles.feedHeadingRow}>
            <Text style={styles.feedTitle}>Feed</Text>
            <Pressable style={styles.refreshButton} onPress={loadFeed} disabled={isLoadingFeed}>
              <Text style={styles.refreshButtonText}>{isLoadingFeed ? 'Loading...' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {feedError ? <Text style={styles.errorText}>{feedError}</Text> : null}
          {isLoadingFeed ? <ActivityIndicator size="small" color={palette.accent} style={styles.feedLoading} /> : null}

          {!isLoadingFeed && !feedItems.length ? (
            <Text style={styles.emptyText}>Noch keine Props im Feed.</Text>
          ) : null}

          {feedItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              onVouch={handleVouch}
              onUnvouch={handleUnvouch}
            />
          ))}

          <Text style={styles.feedTitle}>Profil Feed (gesammelt)</Text>
          {!profileItems.length ? <Text style={styles.emptyText}>Noch keine gesammelten Props.</Text> : null}
          {profileItems.map((item) => (
            <FeedCard
              key={`profile-${item.id}`}
              item={item}
              onVouch={handleVouch}
              onUnvouch={handleUnvouch}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: palette.textSecondary,
    marginBottom: 16,
  },
  sessionLine: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutButton: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: palette.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  placeholderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  placeholderItem: {
    flex: 1,
  },
  feedHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  feedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 10,
  },
  sectionLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: palette.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  feedLoading: {
    marginBottom: 12,
  },
  emptyText: {
    color: palette.textSecondary,
    marginBottom: 12,
    fontSize: 12,
  },
  profileCard: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  profileTitle: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
  },
  profileLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  profileLoadingText: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  label: {
    fontSize: 12,
    color: palette.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: palette.textPrimary,
    backgroundColor: '#FFFFFF',
  },
  bioInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineInput: {
    flex: 1,
  },
  inlineButton: {
    backgroundColor: palette.accent,
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
  inlineButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  requestRow: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  requestText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  friendRowText: {
    color: palette.textPrimary,
    fontSize: 12,
    marginBottom: 6,
  },
  metaText: {
    color: palette.textSecondary,
    fontSize: 11,
    marginTop: 6,
  },
  suggestionWrap: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  suggestionChipText: {
    color: palette.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  unreadRow: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E53935',
    flexShrink: 0,
  },
  notifTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  markAllButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  errorText: {
    marginTop: 8,
    color: '#B00020',
    fontSize: 12,
  },
  noticeText: {
    marginTop: 8,
    color: '#1E5E2E',
    fontSize: 12,
  },
  saveButton: {
    marginTop: 10,
    backgroundColor: palette.accent,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
