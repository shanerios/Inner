import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RecognitionSignalId } from './recognitionSignals';
import type { LucidSignalCuePlan } from './lucidSignalPlans';
export { LUCID_SIGNAL_CUE_OFFSETS_HOURS } from './lucidSignalPlans';
export type { LucidSignalCuePlan } from './lucidSignalPlans';

export const LUCID_SIGNAL_LEARNING_KEY = 'inner.lucid-signal.learning.v1';
export const LUCID_SIGNAL_PLAN_KEY = 'inner.lucid-signal.plan.v1';
const MAX_NIGHTS = 30;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type SignalNotice = 'yes' | 'unsure' | 'no';
export type SleepImpact = 'none' | 'gentle' | 'woke';
export type DreamRecall = 'none' | 'fragment' | 'dream';

export type LucidSignalReflection = {
  recall?: DreamRecall;
  noticed: SignalNotice;
  lucid: boolean;
  sleepImpact: SleepImpact;
};

export type LucidSignalNight = {
  id: string;
  scheduledAt: number;
  sleepOnsetAt: number;
  cueTimes: number[];
  reviewAt: number;
  reflection?: LucidSignalReflection;
  reflectedAt?: number;
  cuePlan?: LucidSignalCuePlan;
  signalId?: RecognitionSignalId;
  morningCaptureEntryId?: string;
};

type LucidSignalLearningState = {
  schemaVersion: 1;
  nights: LucidSignalNight[];
};

const EMPTY_STATE: LucidSignalLearningState = { schemaVersion: 1, nights: [] };

function validNight(value: unknown): value is LucidSignalNight {
  if (!value || typeof value !== 'object') return false;
  const night = value as Partial<LucidSignalNight>;
  return typeof night.id === 'string'
    && typeof night.scheduledAt === 'number'
    && typeof night.sleepOnsetAt === 'number'
    && typeof night.reviewAt === 'number'
    && Array.isArray(night.cueTimes)
    && night.cueTimes.every(time => typeof time === 'number');
}

export async function loadLucidSignalLearning(storage: Storage = AsyncStorage): Promise<LucidSignalLearningState> {
  try {
    const raw = await storage.getItem(LUCID_SIGNAL_LEARNING_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.nights)) return EMPTY_STATE;
    return { schemaVersion: 1, nights: parsed.nights.filter(validNight).slice(0, MAX_NIGHTS) };
  } catch {
    return EMPTY_STATE;
  }
}

export async function recordLucidSignalNight(
  sleepOnsetAt: number,
  cueTimes: number[],
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
  cuePlan: LucidSignalCuePlan = 'standard',
  signalId: RecognitionSignalId = 'ascending',
): Promise<LucidSignalNight> {
  const scheduledAt = now();
  const night: LucidSignalNight = {
    id: `lucid-signal-${scheduledAt}`,
    scheduledAt,
    sleepOnsetAt,
    cueTimes,
    reviewAt: Math.max(sleepOnsetAt + 8 * 60 * 60 * 1000, ...cueTimes),
    cuePlan,
    signalId,
  };
  const state = await loadLucidSignalLearning(storage);
  const nights = [night, ...state.nights.filter(item => item.reflection)].slice(0, MAX_NIGHTS);
  await storage.setItem(LUCID_SIGNAL_LEARNING_KEY, JSON.stringify({ schemaVersion: 1, nights }));
  return night;
}

export async function abandonPendingLucidSignalNight(storage: Storage = AsyncStorage): Promise<void> {
  const state = await loadLucidSignalLearning(storage);
  const nights = state.nights.filter(night => night.reflection);
  await storage.setItem(LUCID_SIGNAL_LEARNING_KEY, JSON.stringify({ schemaVersion: 1, nights }));
}

export async function getPendingLucidSignalReflection(
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<LucidSignalNight | null> {
  const state = await loadLucidSignalLearning(storage);
  return state.nights.find(night => !night.reflection && night.reviewAt <= now()) ?? null;
}

export async function saveLucidSignalReflection(
  nightId: string,
  reflection: LucidSignalReflection,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<LucidSignalLearningState> {
  const state = await loadLucidSignalLearning(storage);
  const nights = state.nights.map(night => night.id === nightId
    ? { ...night, reflection, reflectedAt: now() }
    : night);
  const next = { schemaVersion: 1 as const, nights };
  await storage.setItem(LUCID_SIGNAL_LEARNING_KEY, JSON.stringify(next));
  return next;
}

export async function saveLucidSignalMorningCapture(
  nightId: string,
  journalEntryId: string,
  storage: Storage = AsyncStorage,
): Promise<void> {
  const state = await loadLucidSignalLearning(storage);
  const nights = state.nights.map(night => night.id === nightId
    ? { ...night, morningCaptureEntryId: journalEntryId }
    : night);
  await storage.setItem(LUCID_SIGNAL_LEARNING_KEY, JSON.stringify({ schemaVersion: 1, nights }));
}

export function lucidSignalInsight(nights: LucidSignalNight[]): string | null {
  const reflected = nights.filter((night): night is LucidSignalNight & { reflection: LucidSignalReflection } => Boolean(night.reflection));
  if (reflected.length < 3) return null;
  const recent = reflected.slice(0, 7);
  const noticed = recent.filter(night => night.reflection.noticed === 'yes').length;
  const lucid = recent.filter(night => night.reflection.lucid).length;
  const woke = recent.filter(night => night.reflection.sleepImpact === 'woke').length;
  if (woke >= Math.ceil(recent.length / 2)) return 'The signal may be arriving too strongly for your sleep. A gentler volume is worth trying next.';
  if (noticed >= Math.ceil(recent.length / 2) && lucid > 0) return 'You are noticing the signal, and some of those nights have carried into lucidity.';
  if (noticed >= Math.ceil(recent.length / 2)) return 'You tend to notice the signal without it consistently becoming a lucid cue yet. Recognition practice may help strengthen the link.';
  return 'The signal has stayed subtle across your recent nights. A small volume adjustment may make it easier to recognize.';
}

export type LucidSignalLearningSummary = {
  label: string;
  text: string;
  nightsObserved: number;
};

export function lucidSignalLearningSummary(nights: LucidSignalNight[]): LucidSignalLearningSummary | null {
  const completed = nights.filter(night => Boolean(night.reflection));
  const count = completed.length;
  if (!count) return null;
  if (count === 1) {
    return {
      label: '1 DAY OBSERVED',
      text: 'Inner is listening. One night is a beginning, not yet a pattern.',
      nightsObserved: count,
    };
  }
  if (count === 2) {
    return {
      label: '2 DAYS OBSERVED',
      text: 'Your responses are beginning to form a comparison. One more night may reveal an early pattern.',
      nightsObserved: count,
    };
  }
  return {
    label: `${count} DAYS OBSERVED`,
    text: lucidSignalInsight(completed)!,
    nightsObserved: count,
  };
}

export async function getLucidSignalCuePlan(storage: Storage = AsyncStorage): Promise<LucidSignalCuePlan> {
  try {
    return await storage.getItem(LUCID_SIGNAL_PLAN_KEY) === 'gentle' ? 'gentle' : 'standard';
  } catch {
    return 'standard';
  }
}

export async function setLucidSignalCuePlan(plan: LucidSignalCuePlan, storage: Storage = AsyncStorage): Promise<void> {
  await storage.setItem(LUCID_SIGNAL_PLAN_KEY, plan);
}

export type LucidSignalRecommendation = {
  plan: LucidSignalCuePlan;
  title: string;
  reason: string;
  volumeGuidance: string | null;
};

export function lucidSignalRecommendation(
  nights: LucidSignalNight[],
  currentPlan: LucidSignalCuePlan = 'standard',
): LucidSignalRecommendation | null {
  const reflected = nights
    .filter((night): night is LucidSignalNight & { reflection: LucidSignalReflection } => Boolean(night.reflection))
    .slice(0, 7);
  if (reflected.length < 3) return null;
  const threshold = Math.ceil(reflected.length / 2);
  const woke = reflected.filter(night => night.reflection.sleepImpact === 'woke').length;
  const noticed = reflected.filter(night => night.reflection.noticed === 'yes').length;
  const lucid = reflected.filter(night => night.reflection.lucid).length;
  if (woke >= threshold) {
    return {
      plan: 'gentle',
      title: 'A gentler signal night',
      reason: 'Two later cues may protect more of your sleep while keeping the recognition practice alive.',
      volumeGuidance: 'Consider lowering notification volume slightly before sleep.',
    };
  }
  if (noticed < threshold) {
    return {
      plan: 'standard',
      title: 'Make the signal easier to meet',
      reason: 'Keep three cue opportunities while your recognition pattern is still forming.',
      volumeGuidance: 'Consider raising notification volume only one small step.',
    };
  }
  if (lucid > 0) {
    return {
      plan: currentPlan,
      title: 'Keep what is working',
      reason: 'You have noticed the signal and carried it into lucidity. Stability is more useful than another change tonight.',
      volumeGuidance: null,
    };
  }
  return {
    plan: 'standard',
    title: 'Strengthen the recognition link',
    reason: 'You are noticing the signal. Keep the timing stable and repeat the waking recognition practice.',
    volumeGuidance: null,
  };
}

export async function resetLucidSignalLearning(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(LUCID_SIGNAL_LEARNING_KEY),
    AsyncStorage.removeItem(LUCID_SIGNAL_PLAN_KEY),
  ]);
}
