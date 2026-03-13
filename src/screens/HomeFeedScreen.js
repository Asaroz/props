import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import FeedCard from '../components/feed/FeedCard';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { feedItems } from '../data/mockFeed';
import { palette } from '../theme/colors';

export default function HomeFeedScreen({ currentUser, onLogout }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Props</Text>
          <Text style={styles.subtitle}>Welcome, {currentUser.displayName}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Freunde und ihre gesammelten Props im Ueberblick.</Text>

      <View style={styles.placeholderRow}>
        <View style={styles.placeholderItem}>
          <PlaceholderCard title="Profil" caption="Kommt bald" />
        </View>
        <View style={styles.placeholderItem}>
          <PlaceholderCard title="Neue Props" caption="Kommt bald" />
        </View>
      </View>

      <Text style={styles.feedTitle}>Feed</Text>

      {feedItems.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
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
  feedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 10,
  },
});
