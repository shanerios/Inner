import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FactoryAudioJourney } from './audio';
import { personalizedSignalGuidance } from './audio/preparationFocus';
import type { JournalEntry } from './journalRepo';
import { RECOGNITION_SIGNALS, type RecognitionSignalId } from './recognitionSignals';

export const RECURRING_SIGNAL_FOCUS_KEY = 'inner.recurringSignalFocus.v1';
const RECENT_DREAM_LIMIT = 12;
const MIN_REPETITIONS = 3;
export const RECURRING_SIGNAL_FOCUS_WINDOW_MS = 72 * 60 * 60 * 1000;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export type RecurringDreamSignal = {
  sign: string;
  count: number;
  rememberedDreams: number;
};

export type RecurringSignalFocus = RecurringDreamSignal & {
  setAt: number;
  completedPractice?: {
    sessionId: string;
    completedAt: number;
    signalId: RecognitionSignalId;
    presentationCount: number;
    protocolVersion: 1;
  };
};

export function activeRecurringSignalFocus(
  focus: RecurringSignalFocus | null,
  now = Date.now(),
): RecurringSignalFocus | null {
  if (!focus || focus.setAt > now) return null;
  return now - focus.setAt <= RECURRING_SIGNAL_FOCUS_WINDOW_MS ? focus : null;
}

function isRememberedDream(entry: JournalEntry): boolean {
  if (entry.testSession) return false;
  if (entry.kind !== 'dream') return false;
  if (entry.dreamDetails?.recall === 'none') return false;
  return entry.dreamDetails?.recall === 'fragment'
    || entry.dreamDetails?.recall === 'dream'
    || Boolean(entry.body.trim());
}

export function deriveRecurringDreamSignal(entries: JournalEntry[]): RecurringDreamSignal | null {
  const dreams = entries
    .filter(isRememberedDream)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_DREAM_LIMIT);
  const counts = new Map<string, { sign: string; count: number }>();
  for (const dream of dreams) {
    const seen = new Set<string>();
    for (const rawSign of dream.dreamSigns ?? []) {
      const sign = rawSign.trim();
      const key = sign.toLocaleLowerCase();
      if (!sign || seen.has(key)) continue;
      seen.add(key);
      const current = counts.get(key) ?? { sign, count: 0 };
      current.count += 1;
      counts.set(key, current);
    }
  }
  const strongest = [...counts.values()].sort((a, b) => b.count - a.count || a.sign.localeCompare(b.sign))[0];
  if (!strongest || strongest.count < MIN_REPETITIONS) return null;
  return { ...strongest, rememberedDreams: dreams.length };
}

export function recurringSignalObservation(signal: RecurringDreamSignal): string {
  return `${signal.sign} has appeared in ${signal.count} of your last ${signal.rememberedDreams} remembered dreams.`;
}

export { recurringSignalPrompt } from './audio/preparationFocus';

export async function saveRecurringSignalFocus(
  signal: RecurringDreamSignal,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<RecurringSignalFocus> {
  const focus = { ...signal, setAt: now() };
  await storage.setItem(RECURRING_SIGNAL_FOCUS_KEY, JSON.stringify(focus));
  return focus;
}

export async function loadRecurringSignalFocus(storage: Storage = AsyncStorage): Promise<RecurringSignalFocus | null> {
  try {
    const raw = await storage.getItem(RECURRING_SIGNAL_FOCUS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed.sign !== 'string' || typeof parsed.count !== 'number'
      || typeof parsed.rememberedDreams !== 'number' || typeof parsed.setAt !== 'number') return null;
    const practice = parsed.completedPractice;
    const validPractice = practice
      && typeof practice.sessionId === 'string'
      && typeof practice.completedAt === 'number'
      && RECOGNITION_SIGNALS.some(signal => signal.id === practice.signalId)
      && typeof practice.presentationCount === 'number'
      && practice.protocolVersion === 1;
    const { completedPractice: _completedPractice, ...focus } = parsed;
    return validPractice ? { ...focus, completedPractice: practice } : focus;
  } catch {
    return null;
  }
}

export async function markRecurringSignalPracticeCompleted(
  sign: string,
  practice: RecurringSignalFocus['completedPractice'],
  storage: Storage = AsyncStorage,
): Promise<RecurringSignalFocus | null> {
  if (!practice) return null;
  const focus = await loadRecurringSignalFocus(storage);
  if (!focus || focus.sign.trim().toLocaleLowerCase() !== sign.trim().toLocaleLowerCase()) return null;
  const completed: RecurringSignalFocus = { ...focus, completedPractice: practice };
  await storage.setItem(RECURRING_SIGNAL_FOCUS_KEY, JSON.stringify(completed));
  return completed;
}

export async function clearRecurringSignalFocus(storage: Storage = AsyncStorage): Promise<void> {
  await storage.removeItem(RECURRING_SIGNAL_FOCUS_KEY);
}

export function createRecurringSignalJourney(
  baseJourney: FactoryAudioJourney,
  sign: string,
): FactoryAudioJourney {
  const cleanSign = sign.trim();
  return {
    ...baseJourney,
    title: `${baseJourney.title} — ${cleanSign}`,
    subtitle: `${cleanSign} recognition practice`,
    summary: `Rehearse ${cleanSign} as a personal dream sign while learning the same recognition tone used later tonight.`,
    recognitionPractice: {
      type: 'recurring_dream_sign',
      sign: cleanSign,
      protocolVersion: 1,
    },
    timeline: {
      ...baseJourney.timeline,
      title: `${baseJourney.timeline.title} — ${cleanSign}`,
      guidance: personalizedSignalGuidance(baseJourney.timeline.guidance, cleanSign),
    },
  };
}
