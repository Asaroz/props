import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listGroupsForUser } from '../backend/services';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { palette } from '../theme/colors';

function toSafeErrorMessage(fallbackMessage) {
  return fallbackMessage;
}

export default function GroupListScreen({ currentUser, onBack, onNavigate }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await listGroupsForUser(currentUser);
      setGroups(data || []);
    } catch (_loadError) {
      setError(toSafeErrorMessage('Groups could not be loaded.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>All My Groups</Text>
          <Text style={styles.subtitle}>Deep view for full list and role overview</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={loadGroups} disabled={isLoading}>
          <Text style={styles.refreshButtonText}>{isLoading ? 'Loading...' : 'Reload'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {isLoading ? <ActivityIndicator size="small" color={palette.accent} style={styles.loader} /> : null}

      {!isLoading && !groups.length ? (
        <PlaceholderCard
          title="No groups yet"
          caption="Go back to Groups Hub to create a group or accept an invite."
        />
      ) : null}

      {groups.map((group) => (
        <Pressable
          key={group.id}
          style={styles.groupCard}
          onPress={() => onNavigate('groupDetail', { groupId: group.id })}
        >
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupDescription}>{group.description || 'No description yet.'}</Text>
          <Text style={styles.metaText}>Role: {group.viewerRole || 'member'}</Text>
          <Text style={styles.metaText}>Members: {group.memberCount || 0}</Text>
        </Pressable>
      ))}
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
    gap: 8,
    marginBottom: 14,
  },
  headerTextWrap: {
    flex: 1,
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
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 11,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  refreshButtonText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  loader: {
    marginBottom: 10,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: palette.card,
    marginBottom: 10,
  },
  groupName: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  groupDescription: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  metaText: {
    color: palette.textSecondary,
    fontSize: 11,
  },
  errorText: {
    color: '#B00020',
    fontSize: 12,
    marginBottom: 10,
  },
});