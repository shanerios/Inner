// core/dailyRitual.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { getLearningStreak, registerPracticeActivity, PracticeKind } from './learningStreak';

const DAILY_MICRO_DATE_KEY = 'inner_daily_micro_date';
const DAILY_MICRO_EMOTION_KEY = 'inner_daily_micro_emotion';

function getTodayKey(): string {
  // Simple YYYY-MM-DD string; good enough for v1
  return new Date().toISOString().slice(0, 10);
}

export async function shouldShowDailyMicroRitual(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(DAILY_MICRO_DATE_KEY);
    const today = getTodayKey();
    // Show if never run, or last run wasn’t today
    return stored !== today;
  } catch {
    return true;
  }
}

export async function markDailyMicroRitualComplete(emotion?: string) {
  const today = getTodayKey();
  try {
    await AsyncStorage.setItem(DAILY_MICRO_DATE_KEY, today);
    if (emotion) {
      await AsyncStorage.setItem(DAILY_MICRO_EMOTION_KEY, emotion);
    }
  } catch {
    // fail quietly
  }
}

export async function getLastDailyEmotion(): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(DAILY_MICRO_EMOTION_KEY);
    return val;
  } catch {
    return null;
  }
}

// --- Daily practice snapshot hook ---

export type DailyPracticeSnapshot = {
  streakCount: number;
  activeToday: boolean;
};

/**
 * Hook: returns the current daily practice streak snapshot.
 *
 * It reads from the persisted learning streak and exposes:
 * - streakCount: current streak length in days
 * - activeToday: whether at least one practice event has
 *   been recorded for the current ISO day key.
 */
export function useDailyPracticeSnapshot(): DailyPracticeSnapshot | null {
  const [snapshot, setSnapshot] = React.useState<DailyPracticeSnapshot | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const state = await getLearningStreak();
        if (cancelled) return;

        if (!state.lastActiveDate || state.currentStreak <= 0) {
          setSnapshot(null);
          return;
        }

        const today = getTodayKey();
        const activeToday = state.lastActiveDate === today;

        setSnapshot({
          streakCount: state.currentStreak,
          activeToday,
        });
      } catch {
        if (cancelled) return;
        setSnapshot(null);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return snapshot;
}

export type { PracticeKind };
export { registerPracticeActivity };