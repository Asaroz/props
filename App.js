import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import {
  getCurrentProfile,
  logoutCurrentUser,
  restoreAuthSession,
} from './src/backend/services';
import { palette } from './src/theme/colors';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const hydratedProfileUserIdRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const restoredUser = await restoreAuthSession();
        if (isMounted) {
          setCurrentUser(restoredUser);
        }
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      hydratedProfileUserIdRef.current = null;
      return;
    }

    if (hydratedProfileUserIdRef.current === currentUser.id) {
      return;
    }

    let isMounted = true;

    async function hydrateProfile() {
      try {
        const profile = await getCurrentProfile(currentUser);
        if (isMounted && profile) {
          setCurrentUser((previousUser) => ({
            ...previousUser,
            ...profile,
          }));
          hydratedProfileUserIdRef.current = currentUser.id;
        }
      } catch {
        // Keep UX resilient if profile hydration fails temporarily.
        console.warn('Profile hydration failed.');
      }
    }

    hydrateProfile();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  async function handleLogout() {
    await logoutCurrentUser();
    setCurrentUser(null);
  }

  if (isRestoringSession) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={palette.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <AppNavigator
        currentUser={currentUser}
        onLogin={setCurrentUser}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
