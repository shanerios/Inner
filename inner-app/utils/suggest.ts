import AsyncStorage from '@react-native-async-storage/async-storage';
import { Suggestion } from '../types/suggestion';

// --- Personalization helpers ---
const INTENTIONS_KEY = 'inner.intentions'; // expects JSON string[]
const PROGRESS_KEY = 'inner.progress';     // expects JSON { [lessonId: string]: number /*0..1*/ }

// Acceptable level labels in your data
const LEVELS = ['beginner','intro','core','advanced','mastery'] as const;
type Level = typeof LEVELS[number];

function levelRank(level?: string) {
  const ix = LEVELS.indexOf(String(level || 'core').toLowerCase() as any);
  return ix === -1 ? 2 : ix; // default to 'core'
}

// Heuristic: derive a user stage from progress map
function inferUserStage(progress: Record<string, number> | null): Level {
  if (!progress) return 'beginner';
  // Simple buckets: if any advanced completed > 0.6 → advanced; if any core > 0.6 → core; else beginner
  try {
    const ids = Object.keys(progress);
    const any = (pred: (id: string) => boolean) => ids.some(id => pred(id) && (progress[id] || 0) > 0.6);
    if (any(id => id.includes('mastery'))) return 'advanced'; // gate mastery for now
    if (any(id => id.includes('advanced'))) return 'advanced';
    if (any(id => id.includes('core'))) return 'core';
    return 'beginner';
  } catch {
    return 'beginner';
  }
}

// Score by intention/tag overlap & proximity to user stage
function scoreByIntent(meta: any, intentions: string[], userStage: Level) {
  const tags: string[] = (meta?.tags || meta?.intentions || []) as string[];
  const tagScore = tags.reduce((acc, t) => acc + (intentions.includes(String(t).toLowerCase()) ? 1 : 0), 0);
  const lvl = levelRank(meta?.level);
  const stage = levelRank(userStage);
  const levelBonus = lvl <= stage ? 0.5 : (lvl === stage + 1 ? 0.1 : -1); // discourage too-deep
  return tagScore + levelBonus;
}

function normalizeIntents(x: any): string[] {
  if (!x) return [];
  try {
    const arr = Array.isArray(x) ? x : JSON.parse(x);
    return (arr as any[]).map(s => String(s).toLowerCase());
  } catch { return []; }
}

function hashKey(obj: any) {
  try { return JSON.stringify(obj); } catch { return String(obj); }
}

// Cache includes date + intentions + inferred stage
const STORAGE_KEY = 'inner.today.suggestion.v2';


// Simple date-seeded RNG so “today’s” pick is stable for the day
function seeded(dayKey: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < dayKey.length; i++) { h ^= dayKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 2**32;
}

function pickOne<T>(arr: T[], rnd: () => number) {
  if (!arr.length) return undefined as unknown as T;
  return arr[Math.floor(rnd() * arr.length)];
}

export async function getTodaySuggestion(
  chambers: Suggestion[],
  soundscapes: Suggestion[],
  lessons: Suggestion[],
): Promise<Suggestion> {
  const today = new Date();
  const dayKey = today.toISOString().slice(0,10); // YYYY-MM-DD

  // Load personalization state
  const [intentRaw, progressRaw] = await Promise.all([
    AsyncStorage.getItem(INTENTIONS_KEY),
    AsyncStorage.getItem(PROGRESS_KEY),
  ]);
  const intentions = normalizeIntents(intentRaw);
  const progress = progressRaw ? (JSON.parse(progressRaw) as Record<string, number>) : null;
  const userStage = inferUserStage(progress);

  // Return cached suggestion if same context (date + intents + stage)
  const cached = await AsyncStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const { key, suggestion, ctx } = JSON.parse(cached);
      if (key === dayKey && ctx && ctx.stage === userStage && hashKey(ctx.intentions) === hashKey(intentions)) {
        return suggestion;
      }
    } catch {}
  }

  const rnd = seeded(dayKey + ':' + userStage + ':' + hashKey(intentions));

  // Helper to pick best by score (with stable seeded tie-break)
  function pickBest(arr: Suggestion[]): Suggestion | undefined {
    if (!arr?.length) return undefined;
    const ranked = arr
      .map((s) => ({ s, w: scoreByIntent(s as any, intentions, userStage) }))
      .sort((a, b) => (b.w - a.w) || (rnd() - 0.5));
    // filter out obviously too-deep items if score penalized strongly
    const top = ranked.find(x => x.w > -0.5) || ranked[0];
    return top?.s;
  }

  // Gate lesson pool by stage (don’t surface Mastery unless user is advanced)
  const stageIdx = levelRank(userStage);
  const gatedLessons = lessons.filter((l: any) => levelRank(l?.level) <= Math.min(stageIdx + 1, levelRank('advanced')));

  // Light rotation across kinds but within eligibility
  const bucket = today.getDate() % 3; // 0 chamber, 1 soundscape, 2 lesson
  let suggestion: Suggestion | undefined;

  if (bucket === 0) suggestion = pickBest(chambers) || pickBest(soundscapes) || pickBest(gatedLessons);
  else if (bucket === 1) suggestion = pickBest(soundscapes) || pickBest(chambers) || pickBest(gatedLessons);
  else suggestion = pickBest(gatedLessons) || pickBest(chambers) || pickBest(soundscapes);

  if (!suggestion) suggestion = { kind: 'lesson', id: 'fallback', title: 'Explore Inner', subtitle: 'Follow what calls you.' } as any;

  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ key: dayKey, ctx: { stage: userStage, intentions }, suggestion })
  );
  return suggestion!;
}