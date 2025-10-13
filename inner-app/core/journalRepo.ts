// core/journalRepo.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lightweight uuid generator (no external deps). RFC4122-ish, good enough for client IDs.
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type JournalKind = 'dream' | 'astral' | 'note';

export type JournalEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  body: string;
  intentionTags?: string[]; // e.g. ['calm','clarity']
  mood?: number;            // 1..5
  kind?: JournalKind;
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

export async function listEntries(): Promise<JournalEntry[]> {
  const ids = await readIndex();
  const results: JournalEntry[] = [];
  // newest first (ids list is stored newest-first; keep it)
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(ENTRY_KEY(id));
    if (raw) {
      try { results.push(JSON.parse(raw)); } catch {}
    }
  }
  return results;
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  const raw = await AsyncStorage.getItem(ENTRY_KEY(id));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function createEntry(partial?: Partial<JournalEntry>): Promise<JournalEntry> {
  const now = Date.now();
  const entry: JournalEntry = {
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    title: partial?.title || '',
    body: partial?.body || '',
    intentionTags: partial?.intentionTags || [],
    mood: partial?.mood ?? undefined,
    kind: partial?.kind || 'note',
  };
  await AsyncStorage.setItem(ENTRY_KEY(entry.id), JSON.stringify(entry));
  const ids = await readIndex();
  await writeIndex([entry.id, ...ids]); // prepend newest
  return entry;
}

export async function saveEntry(entry: JournalEntry): Promise<void> {
  entry.updatedAt = Date.now();
  await AsyncStorage.setItem(ENTRY_KEY(entry.id), JSON.stringify(entry));
  // ensure it's in index (in case it was created elsewhere)
  const ids = await readIndex();
  if (!ids.includes(entry.id)) {
    await writeIndex([entry.id, ...ids]);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await AsyncStorage.removeItem(ENTRY_KEY(id));
  const ids = await readIndex();
  await writeIndex(ids.filter(x => x !== id));
}