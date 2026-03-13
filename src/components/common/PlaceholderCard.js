import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../../theme/colors';

export default function PlaceholderCard({ title, caption }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    minHeight: 86,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 4,
  },
  caption: {
    fontSize: 13,
    color: palette.textSecondary,
  },
});
