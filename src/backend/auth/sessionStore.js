import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const AUTH_SESSION_KEY = 'props.auth.session.v1';

async function writeSessionRaw(rawValue) {
  try {
    await SecureStore.setItemAsync(AUTH_SESSION_KEY, rawValue);
    // Remove legacy fallback copy after successful secure write.
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    await AsyncStorage.setItem(AUTH_SESSION_KEY, rawValue);
  }
}

async function readSessionRaw() {
  try {
    const secureValue = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
    if (secureValue) {
      return secureValue;
    }
  } catch {
    // SecureStore may be unavailable in some environments (for example web).
  }

  const fallbackValue = await AsyncStorage.getItem(AUTH_SESSION_KEY);
  if (!fallbackValue) {
    return null;
  }

  // Best-effort migration from legacy AsyncStorage to SecureStore.
  await writeSessionRaw(fallbackValue);
  return fallbackValue;
}

async function clearSessionRaw() {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(AUTH_SESSION_KEY),
    AsyncStorage.removeItem(AUTH_SESSION_KEY),
  ]);
}

export async function saveAuthSession(sessionPayload) {
  await writeSessionRaw(JSON.stringify(sessionPayload));
}

export async function loadAuthSession() {
  const rawValue = await readSessionRaw();
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    await clearSessionRaw();
    return null;
  }
}

export async function clearAuthSession() {
  await clearSessionRaw();
}
