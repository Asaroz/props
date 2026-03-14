import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createPropsEntry, getFriendProfiles } from '../backend/services';
import { palette } from '../theme/colors';

function formatFriendLabel(friend) {
  if (!friend) {
    return 'Unknown friend';
  }

  const displayName = String(friend.displayName || '').trim();
  const username = String(friend.username || '').trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `${displayName} (@${username})`;
  }

  return displayName || username || String(friend.id || '').slice(0, 8);
}

export default function GivePropsScreen({ currentUser, onBack, params }) {
  const selectedGroupId = String(params?.groupId || '').trim();
  const selectedGroupName = String(params?.groupName || '').trim();

  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);

  const [form, setForm] = useState({
    toUserId: '',
    content: '',
    tags: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadFriends = useCallback(async () => {
    setIsLoadingFriends(true);
    try {
      const data = await getFriendProfiles(currentUser);
      setFriends(data || []);
    } catch (err) {
      // Non-fatal: friend list is a convenience. Show empty state instead.
      setFriends([]);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setNotice('');
    setError('');
  }

  function selectFriend(friendId) {
    updateField('toUserId', friendId);
  }

  async function handleSubmit() {
    const normalizedToUserId = form.toUserId.trim();
    const normalizedContent = form.content.trim();
    const tags = form.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!normalizedToUserId) {
      setError('Bitte waehle einen Freund aus.');
      return;
    }

    if (!normalizedContent && !tags.length) {
      setError('Bitte gib einen Text oder mindestens einen Tag an.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      await createPropsEntry(currentUser, {
        toUserId: normalizedToUserId,
        content: normalizedContent,
        tags,
        groupId: selectedGroupId || undefined,
      });
      setNotice('Props vergeben!');
      setForm({ toUserId: '', content: '', tags: '' });
      // Short delay so user sees the success message, then navigate back.
      setTimeout(onBack, 800);
    } catch (err) {
      setError(err.message || 'Props konnten nicht vergeben werden.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedFriend = friends.find((f) => f.id === form.toUserId);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Zurück</Text>
        </Pressable>
        <Text style={styles.title}>Props geben</Text>
      </View>

      <Text style={styles.sectionLabel}>An wen?</Text>

      {isLoadingFriends ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={styles.loadingText}>Freunde laden...</Text>
        </View>
      ) : friends.length === 0 ? (
        <Text style={styles.emptyText}>Noch keine Freunde. Verbinde dich zuerst mit jemandem.</Text>
      ) : (
        <View style={styles.friendGrid}>
          {friends.map((friend) => (
            <Pressable
              key={friend.id}
              style={[
                styles.friendChip,
                form.toUserId === friend.id && styles.friendChipSelected,
              ]}
              onPress={() => selectFriend(friend.id)}
            >
              <Text
                style={[
                  styles.friendChipText,
                  form.toUserId === friend.id && styles.friendChipTextSelected,
                ]}
              >
                {formatFriendLabel(friend)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {selectedFriend ? (
        <Text style={styles.selectedLabel}>
          Ausgewaehlt: {formatFriendLabel(selectedFriend)}
        </Text>
      ) : null}

      {selectedGroupId ? (
        <Text style={styles.groupLabel}>
          Gruppe: {selectedGroupName || selectedGroupId.slice(0, 8)}
        </Text>
      ) : null}

      <Text style={styles.sectionLabel}>Text (optional)</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={form.content}
        onChangeText={(value) => updateField('content', value)}
        multiline
        placeholder="Was war cool?"
        placeholderTextColor={palette.textSecondary}
      />

      <Text style={styles.sectionLabel}>Tags (kommagetrennt, optional)</Text>
      <TextInput
        style={styles.input}
        value={form.tags}
        onChangeText={(value) => updateField('tags', value)}
        autoCapitalize="none"
        placeholder="teamwork, support"
        placeholderTextColor={palette.textSecondary}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Wird gesendet...' : 'Props vergeben'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: palette.background,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backButtonText: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 8,
    marginTop: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: palette.textSecondary,
    marginBottom: 8,
  },
  friendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  friendChip: {
    backgroundColor: palette.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  friendChipSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  friendChipText: {
    fontSize: 14,
    color: palette.textPrimary,
    fontWeight: '500',
  },
  friendChipTextSelected: {
    color: '#FFFFFF',
  },
  selectedLabel: {
    fontSize: 13,
    color: palette.accent,
    marginTop: 4,
    marginBottom: 4,
    fontWeight: '600',
  },
  groupLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 2,
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.textPrimary,
    marginBottom: 4,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#C62828',
    fontSize: 13,
    marginTop: 8,
  },
  noticeText: {
    color: palette.success,
    fontSize: 13,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
