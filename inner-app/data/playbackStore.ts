// data/playbackStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SESSION_KEY = 'playback:lastSession';
const TRACK_POS_PREFIX = 'playback:'; // you already use this in JourneyPlayer
const SCHEMA_VERSION_KEY = 'playback:schemaVersion';
const SCHEMA_VERSION = 1;

export type LastSession = {
  trackId: string;
  title?: string;
  category?: string;       // e.g., 'soundscape' | 'chamber' | 'tones'
  positionMillis: number;
  durationMillis: number;
  updatedAt: number;       // ms epoch
  isLooping?: boolean;
  completed?: boolean;
};

export async function initPlaybackStore() {
  try {
    const v = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    if (String(v) !== String(SCHEMA_VERSION)) {
      // (no migrations yet)
      await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION));
    }
  } catch {}
}

export async function saveNow(params: {
  trackId: string;
  title?: string;
  category?: string;
  positionMillis: number;
  durationMillis: number;
  isLooping?: boolean;
  completed?: boolean;
}) {
  const payload: LastSession = {
    trackId: params.trackId,
    title: params.title,
    category: params.category,
    positionMillis: Math.max(0, params.positionMillis || 0),
    durationMillis: Math.max(1, params.durationMillis || 1),
    isLooping: !!params.isLooping,
    completed: !!params.completed,
    updatedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

export async function markCompleted(trackId: string) {
  try {
    const raw = await AsyncStorage.getItem(LAST_SESSION_KEY);
    const cur: LastSession | null = raw ? JSON.parse(raw) : null;
    if (cur && cur.trackId === trackId) {
      cur.completed = true;
      cur.updatedAt = Date.now();
      await AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify(cur));
    }
  } catch {}
}

export async function getLastSession(): Promise<LastSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SESSION_KEY);
    return raw ? JSON.parse(raw) as LastSession : null;
  } catch {
    return null;
  }
}

// Optional helpers if you want them later
export async function getResumeForTrack(trackId: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${TRACK_POS_PREFIX}${trackId}`);
    if (!raw) return 0;
    const o = JSON.parse(raw);
    return typeof o?.positionMillis === 'number' ? o.positionMillis : 0;
  } catch {
    return 0;
  }
}