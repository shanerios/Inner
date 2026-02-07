// core/learningStreak.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const STREAK_KEY = 'inner_learning_streak_v1';

export type PracticeSource = 'lesson' | 'ritual';

export type LearningStreakState = {
  lastActiveDate: string | null;
  currentStreak: number;
  bestStreak: number;
  lastSource: PracticeSource | null;
};

const DEFAULT_STREAK: LearningStreakState = {
  lastActiveDate: null,
  currentStreak: 0,
  bestStreak: 0,
  lastSource: null,
};

function getTodayISO(): string {
  const now = new Date();
  // Use local date only, ignore time
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  const diff = db.getTime() - da.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export async function getLearningStreak(): Promise<LearningStreakState> {
  try {
    const raw = await AsyncStorage.getItem(STREAK_KEY);
    if (!raw) return DEFAULT_STREAK;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STREAK,
      ...parsed,
    };
  } catch {
    return DEFAULT_STREAK;
  }
}

async function saveLearningStreak(state: LearningStreakState): Promise<void> {
  try {
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Call whenever a real practice event happens
 * (lesson completed or ritual exercise run).
 */
export async function recordPracticeEvent(
  source: PracticeSource
): Promise<LearningStreakState> {
  const today = getTodayISO();
  const prev = await getLearningStreak();

  // First-time event ever
  if (!prev.lastActiveDate) {
    const next: LearningStreakState = {
      lastActiveDate: today,
      currentStreak: 1,
      bestStreak: 1,
      lastSource: source,
    };
    await saveLearningStreak(next);
    return next;
  }

  const diff = daysBetween(prev.lastActiveDate, today);

  let currentStreak = prev.currentStreak;
  if (diff === 0) {
    // Same day: don’t bump streak again, just update lastSource
    const next: LearningStreakState = {
      ...prev,
      lastActiveDate: today,
      lastSource: source,
    };
    await saveLearningStreak(next);
    return next;
  } else if (diff === 1) {
    // Yesterday → today: streak continues
    currentStreak = prev.currentStreak + 1;
  } else if (diff > 1) {
    // Gap of 2+ days: reset
    currentStreak = 1;
  }

  const bestStreak = Math.max(prev.bestStreak, currentStreak);

  const next: LearningStreakState = {
    lastActiveDate: today,
    currentStreak,
    bestStreak,
    lastSource: source,
  };

  await saveLearningStreak(next);
  return next;
}