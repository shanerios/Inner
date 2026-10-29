// core/journalRepo.ts
import { trackEntryContent } from './journalAnalytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureGetItem, secureRemoveItem, secureSetItem } from './secureStorage';
import { DreamDetails, normalizeDreamDetails } from './dreamDetails';
import {
  DreamAddition,
  DreamAdditionKind,
  DreamBaseline,
  MAX_RECOLLECTION_LENGTH,
  normalizeBaseline,
  splitAdditions,
} from './dreamRecollections';
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
  /** The current account. The preserved original lives in `baseline`. */
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
  // ── Repository-owned. saveEntry() never accepts these from callers. ──
  /** The preserved recollection. Written once; never overwritten. */
  baseline?: DreamBaseline;
  /** Later remembered details and reflections, each with its own timestamp. */
  additions?: DreamAddition[];
  /** True while a new capture is still being written; cleared when the baseline is preserved. */
  baselinePending?: boolean;
  /** First time non-empty text was saved to this entry. */
  contentStartedAt?: number;
  /** Stored additions this version could not read, kept as found (never shown, never dropped). */
  unreadableAdditions?: unknown[];
  /** A stored baseline this version could not read, kept as found when a new one is written. */
  unreadableBaseline?: unknown;
};

const INDEX_KEY = 'journal:index';
const INDEX_BACKUP_KEY = 'journal:index:backup';
const ENTRY_KEY = (id: string) => `journal:${id}`;

/** A stored record exists but cannot be decrypted or parsed. It is never overwritten. */
export class JournalRecordUnreadableError extends Error {
  readonly entryId: string;
  constructor(entryId: string) {
    super('Journal record is unreadable.');
    this.name = 'JournalRecordUnreadableError';
    this.entryId = entryId;
  }
}

// ── Serialization ───────────────────────────────────────────────────────────
// Every write to an entry (and to the index) runs through a per-key queue so a
// stale editor autosave, a migration, and an addition can never interleave.

const queues = new Map<string, Promise<unknown>>();
const INDEX_QUEUE = '__index__';

function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  const tail = result.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return result;
}

// ── Index ───────────────────────────────────────────────────────────────────

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

/** Runs inside the index queue. Keeps a copy of an unparsable index before it is rebuilt. */
async function updateIndex(change: (ids: string[]) => string[] | null): Promise<void> {
  await serialize(INDEX_QUEUE, async () => {
    let raw: string | null = null;
    try { raw = await AsyncStorage.getItem(INDEX_KEY); } catch {}
    let ids: string[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === 'string');
      } catch {
        try { await AsyncStorage.setItem(INDEX_BACKUP_KEY, raw); } catch {}
      }
    }
    const next = change(ids);
    if (next) await writeIndex(next);
  });
}

// ── Normalization ───────────────────────────────────────────────────────────

export function normalizeJournalEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.createdAt !== 'number') return null;

  const { valid: validAdditions, rejected } = splitAdditions(raw.additions);
  const previouslyRejected = Array.isArray(raw.unreadableAdditions) ? raw.unreadableAdditions : [];
  const unreadableAdditions = [...previouslyRejected, ...rejected];
  const baseline = normalizeBaseline(raw.baseline);

  const normalized = {
    ...raw,
    schemaVersion: 2,
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : raw.createdAt,
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    dreamDetails: normalizeDreamDetails(raw.dreamDetails),
    baseline,
    additions: validAdditions.length ? validAdditions : undefined,
    unreadableAdditions: unreadableAdditions.length ? unreadableAdditions : undefined,
    unreadableBaseline: raw.unreadableBaseline !== undefined
      ? raw.unreadableBaseline
      : (!baseline && raw.baseline !== undefined && raw.baseline !== null ? raw.baseline : undefined),
    baselinePending: raw.baselinePending === true ? true : undefined,
    contentStartedAt: typeof raw.contentStartedAt === 'number' ? raw.contentStartedAt : undefined,
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

// ── Stored records ──────────────────────────────────────────────────────────

export type StoredRecord =
  | { status: 'missing' }
  | { status: 'unreadable' }
  | { status: 'ok'; plaintext: string; entry: JournalEntry };

/** Callers must hold the entry's queue (use withEntryLock) when a write follows. */
export async function readStoredRecord(id: string): Promise<StoredRecord> {
  let plaintext: string | null;
  try {
    plaintext = await secureGetItem(ENTRY_KEY(id));
  } catch {
    return { status: 'unreadable' };
  }
  if (plaintext == null) return { status: 'missing' };
  const entry = parseEntry(plaintext);
  if (!entry) return { status: 'unreadable' };
  return { status: 'ok', plaintext, entry };
}

export function withEntryLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  return serialize(ENTRY_KEY(id), task);
}

export async function writeStoredPlaintext(id: string, plaintext: string): Promise<void> {
  await secureSetItem(ENTRY_KEY(id), plaintext);
}

async function writeEntry(entry: JournalEntry): Promise<void> {
  await writeStoredPlaintext(entry.id, JSON.stringify(entry));
}

export async function readIndexIds(): Promise<string[]> {
  const ids = await readIndex();
  return ids.filter((id): id is string => typeof id === 'string');
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listEntries(): Promise<JournalEntry[]> {
  const ids = await readIndex();
  const results: JournalEntry[] = [];
  // newest first (ids list is stored newest-first; keep it)
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    try {
      const stored = await withEntryLock(id, () => readStoredRecord(id));
      // One unreadable record must not hide the rest of the journal.
      if (stored.status === 'ok') results.push(stored.entry);
    } catch {
      // keep going
    }
  }
  return results;
}

export async function getEntry(id: string): Promise<JournalEntry | null> {
  const stored = await withEntryLock(id, () => readStoredRecord(id));
  return stored.status === 'ok' ? stored.entry : null;
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createEntry(partial?: Partial<JournalEntry>): Promise<JournalEntry> {
  const now = Date.now();
  const body = partial?.body || '';
  const hasText = body.trim().length > 0;
  const title = partial?.title || '';
  const entry: JournalEntry = {
    schemaVersion: 2,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
    title,
    body,
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
    contentStartedAt: hasText ? now : undefined,
    // A finished body (morning return) is preserved immediately. A blank entry is
    // still being written, so its baseline is preserved when the user leaves it.
    baseline: hasText
      ? { text: body, ...(title ? { title } : {}), capturedAt: now, source: 'original', preservedAt: now }
      : undefined,
    baselinePending: hasText ? undefined : true,
  };
  await withEntryLock(entry.id, async () => {
    await writeEntry(entry);
    await updateIndex(ids => [entry.id, ...ids.filter(id => id !== entry.id)]); // prepend newest
  });
  void trackEntryContent(entry);
  return entry;
}

export async function saveEntry(entry: JournalEntry): Promise<void> {
  const saved = await withEntryLock(entry.id, async () => {
    const stored = await readStoredRecord(entry.id);
    // A record that exists but cannot be read is never replaced by a blind write.
    if (stored.status === 'unreadable') throw new JournalRecordUnreadableError(entry.id);

    const now = Date.now();
    const incoming = normalizeJournalEntry({ ...entry, schemaVersion: 2, updatedAt: now });
    if (!incoming) throw new Error('Invalid journal entry.');

    const prior = stored.status === 'ok' ? stored.entry : undefined;
    // Callers (including stale editor state) cannot change these.
    const merged: JournalEntry = {
      ...incoming,
      baseline: prior?.baseline,
      additions: prior?.additions,
      baselinePending: prior?.baselinePending,
      unreadableAdditions: prior?.unreadableAdditions,
      unreadableBaseline: prior?.unreadableBaseline,
      contentStartedAt: prior?.contentStartedAt
        ?? (incoming.body.trim() ? now : undefined),
    };
    await writeEntry(merged);
    // ensure it's in index (in case it was created elsewhere)
    await updateIndex(ids => (ids.includes(entry.id) ? null : [entry.id, ...ids]));
    return merged;
  });
  void trackEntryContent(saved);
}

export async function deleteEntry(id: string): Promise<void> {
  await withEntryLock(id, async () => {
    await secureRemoveItem(ENTRY_KEY(id));
    await updateIndex(ids => ids.filter(x => x !== id));
  });
}

// ── Baseline ────────────────────────────────────────────────────────────────

export type SealMode = 'legacy_only' | 'capture_complete';

export type SealOutcome =
  | 'sealed'
  | 'already_preserved'
  | 'still_drafting'
  | 'empty'
  | 'missing'
  | 'unreadable'
  | 'verify_failed';

/**
 * Preserves the entry's current text as its baseline, once.
 *
 * - 'legacy_only'      — for records saved before baselines existed (migration, or the
 *                        editor opening one). Entries still being drafted are left alone.
 * - 'capture_complete' — the user finished capturing (left the editor). Also seals drafts.
 *
 * Never changes updatedAt. Verifies the write and restores the prior record if the
 * read-back does not match.
 */
export function preserveBaseline(id: string, mode: SealMode): Promise<SealOutcome> {
  return withEntryLock(id, async () => {
    const stored = await readStoredRecord(id);
    if (stored.status === 'missing') return 'missing';
    if (stored.status === 'unreadable') return 'unreadable';
    const { entry, plaintext } = stored;
    if (entry.baseline) return 'already_preserved';
    if (entry.baselinePending && mode === 'legacy_only') return 'still_drafting';
    if (!entry.body.trim()) return 'empty';

    const now = Date.now();
    const isCapture = entry.baselinePending === true;
    const baseline: DreamBaseline = {
      text: entry.body,
      ...(entry.title ? { title: entry.title } : {}),
      capturedAt: isCapture ? (entry.contentStartedAt ?? entry.createdAt) : entry.createdAt,
      source: isCapture ? 'original' : 'legacy_snapshot',
      preservedAt: now,
    };

    // Preserve every field of the stored record (including ones this version does not
    // know about) by layering onto the raw JSON, not the normalized copy.
    let rawBase: Record<string, unknown>;
    try { rawBase = JSON.parse(plaintext); } catch { return 'unreadable'; }
    // An unreadable baseline already on the record is moved aside, not overwritten.
    const written = {
      ...rawBase,
      baseline,
      baselinePending: undefined,
      ...(entry.unreadableBaseline !== undefined ? { unreadableBaseline: entry.unreadableBaseline } : {}),
    };
    try {
      await writeStoredPlaintext(id, JSON.stringify(written));
      const check = await readStoredRecord(id);
      const ok = check.status === 'ok'
        && check.entry.baseline?.text === baseline.text
        && check.entry.body === entry.body
        && check.entry.createdAt === entry.createdAt
        && check.entry.updatedAt === entry.updatedAt;
      if (!ok) {
        await writeStoredPlaintext(id, plaintext);
        return 'verify_failed';
      }
    } catch {
      try { await writeStoredPlaintext(id, plaintext); } catch {}
      return 'verify_failed';
    }
    return 'sealed';
  });
}

// ── Additions ───────────────────────────────────────────────────────────────

function validAdditionText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Addition text is empty.');
  if (trimmed.length > MAX_RECOLLECTION_LENGTH) throw new Error('Addition text is too long.');
  return trimmed;
}

async function mutateAdditions(
  entryId: string,
  change: (entry: JournalEntry, now: number) => { additions: DreamAddition[]; result?: DreamAddition },
): Promise<{ entry: JournalEntry; addition?: DreamAddition }> {
  return withEntryLock(entryId, async () => {
    const stored = await readStoredRecord(entryId);
    if (stored.status !== 'ok') throw new JournalRecordUnreadableError(entryId);
    if (!stored.entry.baseline) throw new Error('Baseline has not been preserved yet.');
    const now = Date.now();
    const { additions, result } = change(stored.entry, now);
    const entry: JournalEntry = {
      ...stored.entry,
      additions: additions.length ? additions : undefined,
      updatedAt: now,
    };
    await writeEntry(entry);
    return { entry, addition: result };
  });
}

export async function addAddition(
  entryId: string,
  input: { kind: DreamAdditionKind; text: string },
): Promise<{ entry: JournalEntry; addition: DreamAddition }> {
  const text = validAdditionText(input.text);
  const { entry, addition } = await mutateAdditions(entryId, (current, now) => {
    const created: DreamAddition = { id: uuidv4(), kind: input.kind, text, createdAt: now };
    return { additions: [...(current.additions ?? []), created], result: created };
  });
  return { entry, addition: addition as DreamAddition };
}

export async function editAddition(
  entryId: string,
  additionId: string,
  text: string,
): Promise<JournalEntry> {
  const nextText = validAdditionText(text);
  const { entry } = await mutateAdditions(entryId, (current, now) => {
    const list = current.additions ?? [];
    if (!list.some(item => item.id === additionId)) throw new Error('Addition not found.');
    return {
      additions: list.map(item => (
        item.id === additionId ? { ...item, text: nextText, editedAt: now } : item
      )),
    };
  });
  return entry;
}

export async function deleteAddition(entryId: string, additionId: string): Promise<JournalEntry> {
  const { entry } = await mutateAdditions(entryId, current => {
    const list = current.additions ?? [];
    if (!list.some(item => item.id === additionId)) throw new Error('Addition not found.');
    return { additions: list.filter(item => item.id !== additionId) };
  });
  return entry;
}
