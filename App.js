import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { palette } from './src/theme/colors';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <AppNavigator
        currentUser={currentUser}
        onLogin={setCurrentUser}
        onLogout={() => setCurrentUser(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
});
