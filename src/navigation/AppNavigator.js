import React from 'react';
import HomeFeedScreen from '../screens/HomeFeedScreen';
import LoginScreen from '../screens/LoginScreen';

export default function AppNavigator({ currentUser, onLogin, onLogout }) {
  // Placeholder for future navigation setup.
  if (!currentUser) {
    return <LoginScreen onLogin={onLogin} />;
  }

  return <HomeFeedScreen currentUser={currentUser} onLogout={onLogout} />;
}
