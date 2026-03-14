import AsyncStorage from '@react-native-async-storage/async-storage';

const FRIENDS_CACHE_KEY = 'props:friends_snapshot:v1';

export async function loadFriendsSnapshot() {
  try {
    const raw = await AsyncStorage.getItem(FRIENDS_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      savedAt: parsed.savedAt || null,
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      incomingRequests: Array.isArray(parsed.incomingRequests) ? parsed.incomingRequests : [],
    };
  } catch {
    return null;
  }
}

export async function saveFriendsSnapshot(snapshot) {
  try {
    await AsyncStorage.setItem(FRIENDS_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Best-effort cache only.
  }
}
