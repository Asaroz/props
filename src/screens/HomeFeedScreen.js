import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCurrentProfile, updateCurrentProfile } from '../backend/services';
import FeedCard from '../components/feed/FeedCard';
import PlaceholderCard from '../components/common/PlaceholderCard';
import { feedItems } from '../data/mockFeed';
import { palette } from '../theme/colors';

export default function HomeFeedScreen({ currentUser, onLogout }) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    username: '',
    city: '',
    bio: '',
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Props</Text>
          <Text style={styles.subtitle}>Welcome, {currentUser.displayName}</Text>
          <Text style={styles.sessionLine}>Signed in as {currentUser.email || currentUser.username}</Text>
        </View>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>Freunde und ihre gesammelten Props im Ueberblick.</Text>

      <View style={styles.placeholderRow}>
        <Pressable style={styles.placeholderItem} onPress={() => setIsProfileOpen((v) => !v)}>
          <PlaceholderCard
            title="Profil"
            caption={isProfileOpen ? 'Profil bearbeiten' : 'Profil oeffnen'}
          />
        </Pressable>
        <View style={styles.placeholderItem}>
          <PlaceholderCard title="Neue Props" caption="Kommt bald" />
        </View>
      </View>

      {isProfileOpen ? (
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
