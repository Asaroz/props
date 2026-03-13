import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_SESSION_KEY = 'props.auth.session.v1';

export async function saveAuthSession(sessionPayload) {
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(sessionPayload));
}

export async function loadAuthSession() {
  const rawValue = await AsyncStorage.getItem(AUTH_SESSION_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
}

export async function clearAuthSession() {
  await AsyncStorage.removeItem(AUTH_SESSION_KEY);
}
