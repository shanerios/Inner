// learn/progress.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'inner.progress.v1';

type TrackId = 'lucid' | 'obe';
type ProgressMap = {
  [trackId in TrackId]?: {
    [lessonId: string]: number;
  };
};

let progressMap: ProgressMap = {};
let subscribers: Array<(map: ProgressMap) => void> = [];
let persistTimeout: ReturnType<typeof setTimeout> | null = null;

export async function loadProgress() {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      progressMap = JSON.parse(json);
      try { console.log('[progress] loaded from storage:', progressMap); } catch {}
    } else {
      progressMap = {};
      try { console.log('[progress] no saved state'); } catch {}
    }
  } catch (e) {
    progressMap = {};
    try { console.warn('[progress] load error:', e); } catch {}
  }
  notifySubscribers();
  return getProgressMap();
}

export function getProgressMap(): ProgressMap {
  // Return a shallow copy to prevent external mutation
  return JSON.parse(JSON.stringify(progressMap));
}

export function subscribe(fn: (map: ProgressMap) => void): () => void {
  subscribers.push(fn);
  // Fire immediately with a snapshot
  try { fn(getProgressMap()); } catch {}
  return () => {
    subscribers = subscribers.filter(sub => sub !== fn);
  };
}

function notifySubscribers() {
  const snap = getProgressMap();
  subscribers.forEach(fn => {
    try { fn(snap); } catch {}
  });
}

function schedulePersist() {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }
  persistTimeout = setTimeout(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(progressMap));
      try { console.log('[progress] persisted'); } catch {}
    } catch {
      // ignore errors
    }
    persistTimeout = null;
  }, 1000);
}

export function setLessonProgress(trackId: TrackId, lessonId: string, value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  if (!progressMap[trackId]) {
    progressMap[trackId] = {};
  }
  const prev = progressMap[trackId]![lessonId];
  if (prev === clamped) return; // no change
  progressMap[trackId]![lessonId] = clamped;
  try { console.log('[progress] set', `${trackId}:${lessonId}`, '→', clamped); } catch {}
  notifySubscribers();
  schedulePersist();
}