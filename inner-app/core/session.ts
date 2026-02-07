// core/session.ts
import AsyncStorage from '@react-native-async-storage/async-storage';


const KEY = 'inner.lastSession.v1';
const INTENTIONS_KEY = 'inner.intentions.v1';

// Intention timeline + nudges
const INTENTION_SET_AT_KEY = 'inner.intentions.setAt.v1';
const LAST_NUDGE_SHOWN_AT_KEY = 'inner.nudges.lastShownAt.v1';

// User may select up to two intentions
export type IntentionKey =
  | 'calm'
  | 'clarity'
  | 'grounding'
  | 'healing'
  | 'reawakening'
  | 'expansion';

export type Intentions = IntentionKey[]; // length 0..2

function normalizeIntentions(input: string[] | null | undefined): Intentions {
  if (!input || !Array.isArray(input)) return [];
  // Dedupe, lowercase, filter to allowed set, clamp length to 2
  const allowed: Record<string, true> = {
    calm: true,
    clarity: true,
    grounding: true,
    healing: true,
    reawakening: true,
    expansion: true,
  };
  const seen = new Set<string>();
  const out: IntentionKey[] = [];
  for (const raw of input) {
    if (out.length >= 2) break;
    const k = String(raw).toLowerCase().trim();
    if (allowed[k] && !seen.has(k)) {
      seen.add(k);
      out.push(k as IntentionKey);
    }
  }
  return out;
}

export type LastSession =
  | { type: 'journey'; id: string }        // e.g. "chamber1"
  | { type: 'soundscape'; id: string };    // e.g. "ocean-stillness"

export async function setLastSession(s: LastSession) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export async function getLastSession(): Promise<LastSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as LastSession : null;
  } catch { return null; }
}

export async function clearLastSession() {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

/** Persist up to two selected intentions. Extra items are ignored. */
export async function setIntentions(keys: string[] | Intentions) {
  const normalized = normalizeIntentions(keys as string[]);
  try {
    // If clearing intentions, also clear the timeline timestamp
    if (normalized.length === 0) {
      await AsyncStorage.removeItem(INTENTIONS_KEY);
      await AsyncStorage.removeItem(INTENTION_SET_AT_KEY);
      return;
    }

    const nextStr = JSON.stringify(normalized);

    // Only bump the "set at" timestamp when the intention state actually changes.
    const prevStr = await AsyncStorage.getItem(INTENTIONS_KEY);
    const prevSetAt = await AsyncStorage.getItem(INTENTION_SET_AT_KEY);

    const changed = !prevStr || prevStr !== nextStr;

    await AsyncStorage.setItem(INTENTIONS_KEY, nextStr);

    // Set timeline start time if changed OR missing.
    if (changed || !prevSetAt) {
      await AsyncStorage.setItem(INTENTION_SET_AT_KEY, String(Date.now()));
    }
  } catch {}
}

/** Read selected intentions (0..2). Returns [] when none are set. */
export async function getIntentions(): Promise<Intentions> {
  try {
    const raw = await AsyncStorage.getItem(INTENTIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return normalizeIntentions(arr);
  } catch {
    return [];
  }
}

/** When the current intention state was last set. Returns null when unknown. */
export async function getIntentionSetAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(INTENTION_SET_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist the last time we actually *showed* a nudge (cooldown control). */
export async function setLastNudgeShownAt(tsMs: number) {
  try {
    await AsyncStorage.setItem(LAST_NUDGE_SHOWN_AT_KEY, String(tsMs));
  } catch {}
}

/** Read the last time we actually *showed* a nudge. */
export async function getLastNudgeShownAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_NUDGE_SHOWN_AT_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Clear the stored nudge cooldown timestamp. */
export async function clearLastNudgeShownAt() {
  try { await AsyncStorage.removeItem(LAST_NUDGE_SHOWN_AT_KEY); } catch {}
}

/** Clear any stored intentions. */
export async function clearIntentions() {
  try {
    await AsyncStorage.removeItem(INTENTIONS_KEY);
    await AsyncStorage.removeItem(INTENTION_SET_AT_KEY);
  } catch {}
}

/** ------------------ UI & convenience helpers ------------------ */

/** Format intentions for UI labels, e.g., "Calm & Expansion" */
export function formatIntentions(keys: Intentions): string {
  const titled = keys.map(k => k[0].toUpperCase() + k.slice(1));
  if (titled.length === 0) return '';
  if (titled.length === 1) return titled[0];
  return `${titled[0]} & ${titled[1]}`;
}

/** Quick predicate to check if an intention is present */
export function hasIntention(keys: Intentions, target: IntentionKey): boolean {
  return keys.includes(target);
}

/** Optional theme map for subtle tinting across the app */
export const INTENTION_THEME: Record<IntentionKey, { tint: string; glow: string }> = {
  calm:        { tint: '#7BD1C8', glow: '#2C4B47' },
  clarity:     { tint: '#FFC979', glow: '#4B3A1F' },
  grounding:   { tint: '#A78B6D', glow: '#3A2D22' },
  healing:     { tint: '#FF9DB6', glow: '#4B2633' },
  reawakening: { tint: '#C59BFF', glow: '#2C1F4B' },
  expansion:   { tint: '#9BA7FF', glow: '#1B1E3D' },
};