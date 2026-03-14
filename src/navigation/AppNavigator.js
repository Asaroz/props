import React, { useState } from 'react';
import HomeFeedScreen from '../screens/HomeFeedScreen';
import LoginScreen from '../screens/LoginScreen';
import GivePropsScreen from '../screens/GivePropsScreen';
import GroupsHubScreen from '../screens/GroupsHubScreen';
import GroupListScreen from '../screens/GroupListScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';

const ALLOWED_RETURN_SCREENS = new Set(['home', 'groupsHub', 'groupList', 'groupDetail', 'createGroup']);

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

  function handleBackTo(screen, params) {
    setCurrentScreen(screen);
    setScreenParams(params || null);
  }

  if (!currentUser) {
    return <LoginScreen onLogin={onLogin} />;
  }

  if (currentScreen === 'giveProps') {
    const requestedReturnScreen = String(screenParams?.returnTo || '').trim();
    const returnToScreen = ALLOWED_RETURN_SCREENS.has(requestedReturnScreen)
      ? requestedReturnScreen
      : '';
    const returnToParams = screenParams?.returnParams || null;

    return (
      <GivePropsScreen
        currentUser={currentUser}
        onBack={
          returnToScreen
            ? () => handleBackTo(returnToScreen, returnToParams)
            : handleBack
        }
        params={screenParams}
      />
    );
  }

  if (currentScreen === 'groupsHub') {
    return (
      <GroupsHubScreen
        currentUser={currentUser}
        onBack={handleBack}
        onNavigate={handleNavigate}
      />
    );
  }

  if (currentScreen === 'groupList') {
    return (
      <GroupListScreen
        currentUser={currentUser}
        onBack={() => handleBackTo('groupsHub')}
        onNavigate={handleNavigate}
      />
    );
  }

  if (currentScreen === 'groupDetail') {
    return (
      <GroupDetailScreen
        currentUser={currentUser}
        params={screenParams}
        onBack={() => handleBackTo('groupsHub')}
        onNavigate={handleNavigate}
      />
    );
  }

  if (currentScreen === 'createGroup') {
    return (
      <CreateGroupScreen
        currentUser={currentUser}
        onBack={() => handleBackTo('groupsHub')}
        onNavigate={handleNavigate}
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
