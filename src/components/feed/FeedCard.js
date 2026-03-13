import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../../theme/colors';

export default function FeedCard({ item }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.friendName}>{item.friendName}</Text>
          <Text style={styles.meta}>{item.location}</Text>
        </View>
        <Text style={styles.meta}>{item.updatedAt}</Text>
      </View>

      <Text style={styles.sectionLabel}>Gesammelte Props</Text>

      <View style={styles.tagWrap}>
        {item.collectedProps.map((prop) => (
          <View key={prop} style={styles.tag}>
            <Text style={styles.tagText}>{prop}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footerHint}>Profil und Interaktionen folgen als naechstes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  friendName: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  meta: {
    fontSize: 12,
    color: palette.textSecondary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 8,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: palette.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: palette.accent,
    fontWeight: '600',
    fontSize: 12,
  },
  footerHint: {
    marginTop: 12,
    fontSize: 12,
    color: palette.textSecondary,
  },
});
