import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRACTICE_HISTORY_KEY = 'inner.practiceHistory.v1';
const MAX_PRACTICE_RECORDS = 120;
let mutationQueue: Promise<void> = Promise.resolve();

export type RecordedPracticeType = 'chamber' | 'soundscape' | 'guardian' | 'tuning';

export type PracticeActivityRecord = {
  id: string;
  type: RecordedPracticeType;
  contentId?: string;
  contentTitle: string;
  startedAt: number;
  endedAt?: number;
};

function isRecord(value: unknown): value is PracticeActivityRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<PracticeActivityRecord>;
  return typeof item.id === 'string'
    && ['chamber', 'soundscape', 'guardian', 'tuning'].includes(item.type ?? '')
    && typeof item.contentTitle === 'string'
    && typeof item.startedAt === 'number';
}

export async function listPracticeActivity(): Promise<PracticeActivityRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PRACTICE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(isRecord).sort((a, b) => b.startedAt - a.startedAt)
      : [];
  } catch {
    return [];
  }
}

export async function recordPracticeActivity(record: PracticeActivityRecord): Promise<void> {
  mutationQueue = mutationQueue.catch(() => {}).then(async () => {
    try {
      const existing = await listPracticeActivity();
      const next = [record, ...existing.filter(item => item.id !== record.id)]
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, MAX_PRACTICE_RECORDS);
      await AsyncStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Practice memory must never interrupt playback or navigation.
    }
  });
  return mutationQueue;
}

export async function finishPracticeActivity(id: string, endedAt = Date.now()): Promise<void> {
  mutationQueue = mutationQueue.catch(() => {}).then(async () => {
    try {
      const existing = await listPracticeActivity();
      const record = existing.find(item => item.id === id);
      if (!record) return;
      const updated = { ...record, endedAt: Math.max(record.startedAt, endedAt) };
      const next = [updated, ...existing.filter(item => item.id !== id)]
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, MAX_PRACTICE_RECORDS);
      await AsyncStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Practice memory must never interrupt playback or navigation.
    }
  });
  return mutationQueue;
}

export function createPracticeActivityId(type: RecordedPracticeType, at = Date.now()): string {
  return `${type}-${at}-${Math.random().toString(36).slice(2, 9)}`;
}

export const PRACTICE_LINK_WINDOW_MS = 72 * 60 * 60 * 1000;
