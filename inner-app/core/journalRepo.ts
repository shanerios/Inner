// core/journalRepo.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureGetItem, secureRemoveItem, secureSetItem } from './secureStorage';
import { DreamDetails, normalizeDreamDetails } from './dreamDetails';
import type { PracticeContextSnapshot } from './practiceContext';

// Lightweight uuid generator (no external deps). RFC4122-ish, good enough for client IDs.
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type JournalKind = 'dream' | 'astral' | 'note' | 'chamber';

export type JournalEntry = {
  schemaVersion: 2;
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  body: string;
  intentionTags?: string[]; // e.g. ['calm','clarity']
  mood?: number;            // 1..5
  kind?: JournalKind;
  chamberId?: string;       // set when kind === 'chamber'
  chamberTitle?: string;    // human-readable title of the chamber session
  dreamSigns?: string[];
  journeySessionId?: string;
  nightPlanId?: string;
  captureSource?: 'morning_return';
  /** Development QA evidence; excluded from personalization and user exports. */
  testSession?: boolean;
  captureMinutesFromWake?: number;
  dreamDetails?: DreamDetails;
  practiceContext?: PracticeContextSnapshot;
  captureInput?: {
    method: 'typed' | 'voice_transcription' | 'morning_quick_capture';
    startedAt?: number;
    completedAt?: number;
    recognitionMode?: 'on_device' | 'platform_service' | 'unknown';
  };
};

const INDEX_KEY = 'journal:index';
const ENTRY_KEY = (id: string) => `journal:${id}`;

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.createdAt !== 'number') return null;

  const normalized = {
    ...raw,
    schemaVersion: 2,
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : raw.createdAt,
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    dreamDetails: normalizeDreamDetails(raw.dreamDetails),
  } as JournalEntry;

  return normalized;
}

function parseEntry(raw: string): JournalEntry | null {
  try {
    return normalizeJournalEntry(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function listEntries(): Promise<JournalEntry[]> {
  const ids = await readIndex();
  const results: JournalEntry[] = [];
  // newest first (ids list is stored newest-first; keep it)
  for (const id of ids) {
    const raw = await secureGetItem(ENTRY_KEY(id));
    if (raw) {
      const entry = parseEntry(raw);
      if (entry) results.push(entry);
    }
  }
  return results;
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  const raw = await secureGetItem(ENTRY_KEY(id));
  if (!raw) return null;
  return parseEntry(raw);
}

export async function createEntry(partial?: Partial<JournalEntry>): Promise<JournalEntry> {
  const now = Date.now();
  const entry: JournalEntry = {
    schemaVersion: 2,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    title: partial?.title || '',
    body: partial?.body || '',
    intentionTags: partial?.intentionTags || [],
    mood: partial?.mood ?? undefined,
    kind: partial?.kind || 'note',
    dreamSigns: partial?.dreamSigns || [],
    chamberId: partial?.chamberId,
    chamberTitle: partial?.chamberTitle,
    journeySessionId: partial?.journeySessionId,
    nightPlanId: partial?.nightPlanId,
    captureSource: partial?.captureSource,
    testSession: partial?.testSession,
    captureMinutesFromWake: partial?.captureMinutesFromWake,
    dreamDetails: normalizeDreamDetails(partial?.dreamDetails),
    practiceContext: partial?.practiceContext,
    captureInput: partial?.captureInput,
  };
  await secureSetItem(ENTRY_KEY(entry.id), JSON.stringify(entry));
  const ids = await readIndex();
  await writeIndex([entry.id, ...ids]); // prepend newest
  return entry;
}

export async function saveEntry(entry: JournalEntry): Promise<void> {
  const normalized = normalizeJournalEntry({ ...entry, schemaVersion: 2, updatedAt: Date.now() });
  if (!normalized) throw new Error('Invalid journal entry.');
  await secureSetItem(ENTRY_KEY(entry.id), JSON.stringify(normalized));
  // ensure it's in index (in case it was created elsewhere)
  const ids = await readIndex();
  if (!ids.includes(entry.id)) {
    await writeIndex([entry.id, ...ids]);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await secureRemoveItem(ENTRY_KEY(id));
  const ids = await readIndex();
  await writeIndex(ids.filter(x => x !== id));
}
