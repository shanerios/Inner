import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';

const COUNTED_KEY = 'inner.analytics.countedEntries';
const MAX_COUNTED = 500;

let counted: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;

async function loadCounted(): Promise<Set<string>> {
  if (counted) return counted;
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(COUNTED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      counted = new Set(Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : []);
    } catch {
      counted = new Set();
    }
    return counted;
  })();
  return loading;
}

/** Test seam. */
export function resetJournalAnalyticsForTests() {
  counted = null;
  loading = null;
}

type EntryLike = {
  id: string;
  body?: string;
  kind?: string;
  captureSource?: string;
  captureInput?: { method?: string };
  journeySessionId?: string;
};

/**
 * Reports `dream_entry_created` the first time an entry has any content. Entries are often created
 * empty and typed into later, so creation alone would overcount. Only the entry's kind and how it
 * was captured are sent: never its id, title, body or dream signs. Safe to call on every save.
 */
export async function trackEntryContent(entry: EntryLike): Promise<void> {
  try {
    if (!entry.body || !entry.body.trim()) return;
    const set = await loadCounted();
    if (set.has(entry.id)) return;
    set.add(entry.id);
    await AsyncStorage.setItem(COUNTED_KEY, JSON.stringify([...set].slice(-MAX_COUNTED)));
    track('dream_entry_created', {
      kind: entry.kind,
      capture_source: entry.captureSource ?? 'journal',
      capture_method: entry.captureInput?.method ?? 'typed',
      from_overnight: !!entry.journeySessionId,
    });
  } catch {}
}

/** Opening an existing entry. Age is bucketed so it cannot identify a particular dream. */
export function trackEntryRevisited(createdAt: number | undefined, now = Date.now()) {
  // An entry just created and opened for typing is not a revisit.
  if (typeof createdAt === 'number' && now - createdAt < 120_000) return;
  const ageDays = typeof createdAt === 'number' ? Math.floor(Math.max(0, now - createdAt) / 86_400_000) : undefined;
  const age_bucket = ageDays === undefined ? undefined
    : ageDays < 1 ? 'same_day'
      : ageDays < 7 ? 'under_week'
        : ageDays < 30 ? 'under_month' : 'older';
  track('dream_entry_revisited', { age_bucket });
}
