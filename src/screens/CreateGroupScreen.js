import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createGroup } from '../backend/services';
import { palette } from '../theme/colors';

function toSafeErrorMessage(fallbackMessage) {
  return fallbackMessage;
}

export default function CreateGroupScreen({ currentUser, onBack, onNavigate }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function updateField(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
    setError('');
    setNotice('');
  }

  async function handleSubmit() {
    const normalizedName = form.name.trim();
    const normalizedDescription = form.description.trim();

    if (!normalizedName) {
      setError('Group name is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setNotice('');

    try {
      const created = await createGroup(currentUser, {
        name: normalizedName,
        description: normalizedDescription,
      });

      setNotice('Group created successfully.');
      onNavigate('groupDetail', {
        groupId: created.id,
      });
    } catch (_submitError) {
      setError(toSafeErrorMessage('Group could not be created.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Create Group</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Group Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(value) => updateField('name', value)}
          placeholder="Team Builders"
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.sectionLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={form.description}
          onChangeText={(value) => updateField('description', value)}
          multiline
          placeholder="What is this group about?"
          placeholderTextColor={palette.textSecondary}
        />

        <Text style={styles.sectionLabel}>Cover Image Placeholder</Text>
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderText}>No cover image URL yet.</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitButtonText}>{isSubmitting ? 'Creating...' : 'Create Group'}</Text>
        </Pressable>
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
    gap: 10,
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
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  card: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.card,
    padding: 12,
  },
  sectionLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    marginBottom: 5,
    marginTop: 8,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: palette.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  multilineInput: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  coverPlaceholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    borderRadius: 10,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  coverPlaceholderText: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  submitButton: {
    marginTop: 14,
    backgroundColor: palette.accent,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
});