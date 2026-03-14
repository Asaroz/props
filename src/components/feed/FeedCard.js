import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette } from '../../theme/colors';

export default function FeedCard({ item, onVouch, onUnvouch }) {
  const [isVouching, setIsVouching] = useState(false);
  const [vouchError, setVouchError] = useState('');

  async function handleVouchToggle() {
    setIsVouching(true);
    setVouchError('');
    try {
      if (item.hasVouched) {
        await onUnvouch(item.id);
      } else {
        await onVouch(item.id);
      }
    } catch (error) {
      setVouchError(error.message || 'Vouch fehlgeschlagen.');
    } finally {
      setIsVouching(false);
    }
  }

  const canVouch = typeof onVouch === 'function' && typeof onUnvouch === 'function';

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

      <View style={styles.vouchRow}>
        <Text style={styles.vouchCount}>
          {item.vouchCount === 1 ? '1 Vouch' : `${item.vouchCount ?? 0} Vouches`}
        </Text>
        {canVouch ? (
          <Pressable
            style={[styles.vouchButton, item.hasVouched && styles.vouchButtonActive]}
            onPress={handleVouchToggle}
            disabled={isVouching}
          >
            <Text style={[styles.vouchButtonText, item.hasVouched && styles.vouchButtonTextActive]}>
              {isVouching ? '...' : item.hasVouched ? 'Unvouch' : 'Vouch'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {vouchError ? <Text style={styles.vouchError}>{vouchError}</Text> : null}
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
  vouchRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vouchCount: {
    fontSize: 12,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  vouchButton: {
    borderWidth: 1,
    borderColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  vouchButtonActive: {
    backgroundColor: palette.accent,
  },
  vouchButtonText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  vouchButtonTextActive: {
    color: '#FFFFFF',
  },
  vouchError: {
    marginTop: 4,
    fontSize: 11,
    color: '#C62828',
  },
});
