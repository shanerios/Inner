import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeDreamDetails, type DreamDetails, type DreamRecall, type DreamSleepImpact } from './dreamDetails';
import type { SignalNotice } from './lucidSignalLearning';
import type { PracticeContextSnapshot } from './practiceContext';

export const NIGHT_RECORDS_KEY = 'inner.nightRecords.v1';
export const NIGHT_RECORD_SCHEMA_VERSION = 1 as const;
const MAX_NIGHT_RECORDS = 90;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type NightRecord = {
  schemaVersion: typeof NIGHT_RECORD_SCHEMA_VERSION;
  id: string;
  source: 'overnight_journey' | 'scheduled_signal';
  sourceSessionId: string;
  nightPlanId?: string;
  scheduledAt: number;
  sleepOnsetAt: number;
  reviewAt: number;
  reflectedAt: number;
  /** Development QA evidence; excluded from personalization and user exports. */
  testSession?: boolean;
  journalEntryId?: string;
  practiceContext?: PracticeContextSnapshot;
  outcome: {
    recall: DreamRecall;
    dreamDetails?: DreamDetails;
    signalNotice?: SignalNotice;
    sleepImpact?: DreamSleepImpact;
  };
};

function validNightRecord(value: unknown): value is NightRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<NightRecord>;
  return record.schemaVersion === NIGHT_RECORD_SCHEMA_VERSION
    && typeof record.id === 'string'
    && typeof record.sourceSessionId === 'string'
    && ['overnight_journey', 'scheduled_signal'].includes(record.source ?? '')
    && typeof record.scheduledAt === 'number'
    && typeof record.sleepOnsetAt === 'number'
    && typeof record.reviewAt === 'number'
    && typeof record.reflectedAt === 'number'
    && Boolean(record.outcome)
    && ['none', 'fragment', 'dream'].includes(record.outcome?.recall ?? '');
}

export async function loadNightRecords(storage: Storage = AsyncStorage): Promise<NightRecord[]> {
  try {
    const raw = await storage.getItem(NIGHT_RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schemaVersion !== NIGHT_RECORD_SCHEMA_VERSION || !Array.isArray(parsed.records)) return [];
    return parsed.records
      .filter(validNightRecord)
      .map((record: NightRecord) => ({
        ...record,
        testSession: record.testSession || record.sourceSessionId.startsWith('journey-qa-') || undefined,
        outcome: {
          ...record.outcome,
          dreamDetails: normalizeDreamDetails(record.outcome.dreamDetails),
        },
      }))
      .sort((a: NightRecord, b: NightRecord) => b.reflectedAt - a.reflectedAt)
      .slice(0, MAX_NIGHT_RECORDS);
  } catch {
    return [];
  }
}

export async function saveNightRecord(
  record: Omit<NightRecord, 'schemaVersion'>,
  storage: Storage = AsyncStorage,
): Promise<NightRecord> {
  const normalized: NightRecord = {
    ...record,
    schemaVersion: NIGHT_RECORD_SCHEMA_VERSION,
    outcome: {
      ...record.outcome,
      dreamDetails: normalizeDreamDetails(record.outcome.dreamDetails),
    },
  };
  const existing = await loadNightRecords(storage);
  const records = [normalized, ...existing.filter(item => item.id !== normalized.id)]
    .sort((a, b) => b.reflectedAt - a.reflectedAt)
    .slice(0, MAX_NIGHT_RECORDS);
  await storage.setItem(NIGHT_RECORDS_KEY, JSON.stringify({
    schemaVersion: NIGHT_RECORD_SCHEMA_VERSION,
    records,
  }));
  return normalized;
}
