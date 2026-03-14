import React, { useState } from 'react';
import HomeFeedScreen from '../screens/HomeFeedScreen';
import LoginScreen from '../screens/LoginScreen';
import GivePropsScreen from '../screens/GivePropsScreen';

export default function AppNavigator({ currentUser, onLogin, onLogout }) {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [screenParams, setScreenParams] = useState(null);

  function handleNavigate(screen, params) {
    setCurrentScreen(screen);
    setScreenParams(params || null);
  }

  function handleBack() {
    setCurrentScreen('home');
    setScreenParams(null);
  }

  if (!currentUser) {
    return <LoginScreen onLogin={onLogin} />;
  }

  if (currentScreen === 'giveProps') {
    return (
      <GivePropsScreen
        currentUser={currentUser}
        onBack={handleBack}
        params={screenParams}
      />
    );
  }

  return (
    <HomeFeedScreen
      currentUser={currentUser}
      onLogout={onLogout}
      onNavigate={handleNavigate}
    />
  );
}
