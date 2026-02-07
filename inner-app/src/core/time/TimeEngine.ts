import AsyncStorage from '@react-native-async-storage/async-storage';

export type TimeContext = {
  nowMs?: number;
};


/**
 * TimeEngine v1
 *
 * Goal: give Inner a gentle sense of time (streaks + weekly cadence) without gamification.
 * Returns at most one optional threshold line per day/session, rate-limited.
 */

export type TimeThresholdId =
  | 'return.next_day'
  | 'return.after_gap'
  | 'return.after_week'
  | 'return.after_21'
  | 'streak.3'
  | 'streak.7'
  | 'streak.14'
  | 'streak.21'
  | 'week.5';

export type TimeState = {
  // last open
  lastOpenAt?: number; // ms
  lastDate?: string; // YYYY-MM-DD (local)

  // streak (consecutive calendar days)
  streak?: number;

  // weekly cadence (Mon–Sun)
  weekStart?: string; // YYYY-MM-DD (local, Monday)
  weekCount?: number;

  // rate-limit for showing time-based lines
  lastTimeLineAt?: number; // ms
  lastTimeLineDate?: string; // YYYY-MM-DD (local)

  // Prevent repeating the same milestone too frequently
  // Map: threshold id -> last shown local date key (YYYY-MM-DD)
  shown?: Partial<Record<TimeThresholdId, string>>;

  // After rare / high-salience lines, keep TimeEngine quiet for a few days
  lastBigTimeLineAt?: number; // ms
  lastBigTimeLineDate?: string; // YYYY-MM-DD (local)
};

const TIME_STATE_KEY = 'inner.time.state.v1';

// Cadence + rarity (tweakable)
// 1) Hard caps are enforced by canShowLine(): once/day + min hours between fires.
const MIN_HOURS_BETWEEN_LINES = 42; // rarity + "intentional" feel

// 2) Allow TimeEngine to speak only during a calm window (local time)
const ALLOWED_HOUR_START = 7;  // 7am
const ALLOWED_HOUR_END = 23;   // 11pm

// 3) Probability gate: even if eligible, it only speaks sometimes.
// ~0.18–0.25 feels like "rare signals" (1–2 times/week for daily users)
const BASE_FIRE_PROBABILITY = 0.18;

// 4) Silence bias after big moments (keep time-lines quiet for a few days)
const BIG_MOMENT_SILENCE_DAYS = 4;

// Threshold definitions
const GAP_DAYS_TRIGGER = 3; // "welcome back" after 3+ days away
const GAP_DAYS_WEEK = 7;
const GAP_DAYS_21 = 21;

const STREAK_3 = 3;
const STREAK_7 = 7;
const STREAK_14 = 14;
const STREAK_21 = 21;

const WEEK_SESSIONS_5 = 5;

const COPY: Record<TimeThresholdId, string> = {
  'return.next_day': 'You returned. The field remembers.',
  'return.after_gap': 'Welcome back. Begin gently.',
  'return.after_week': 'A week away. The door opens the same.',
  'return.after_21': 'It has been a while. Enter softly.',

  'streak.3': 'Three days in rhythm. Your nervous system is learning the way.',
  'streak.7': 'A week of steadiness. Now clarity comes easier.',
  'streak.14': 'Two weeks of return. The signal is stronger.',
  'streak.21': 'Twenty-one days. A new baseline is forming.',

  'week.5': 'Your practice has weight now.',
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local YYYY-MM-DD (not UTC). */
export function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(key: string): Date {
  // key is YYYY-MM-DD. Build a local Date at midnight.
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function diffDays(aKey: string, bKey: string): number {
  // a - b in whole days (local)
  const a = parseLocalDateKey(aKey);
  const b = parseLocalDateKey(bKey);
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function startOfWeekMondayKey(d: Date): string {
  // Monday as start of week
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMon = (dow + 6) % 7; // Mon->0, Tue->1, ... Sun->6
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() - diffToMon);
  return localDateKey(monday);
}

async function loadState(): Promise<TimeState> {
  try {
    const raw = await AsyncStorage.getItem(TIME_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed || {}) as TimeState;
  } catch {
    return {};
  }
}

async function saveState(state: TimeState): Promise<void> {
  try {
    await AsyncStorage.setItem(TIME_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function canShowLine(nowMs: number, state: TimeState, todayKey: string): boolean {
  // Never more than once per calendar day
  if (state.lastTimeLineDate && state.lastTimeLineDate === todayKey) return false;

  // Also rate-limit in case of time changes / hot reload loops
  if (typeof state.lastTimeLineAt === 'number') {
    const hoursSince = (nowMs - state.lastTimeLineAt) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_BETWEEN_LINES) return false;
  }

  return true;
}

function markLineShown(state: TimeState, nowMs: number, todayKey: string) {
  state.lastTimeLineAt = nowMs;
  state.lastTimeLineDate = todayKey;
}

function idShownRecently(state: TimeState, id: TimeThresholdId, todayKey: string, cooldownDays: number) {
  const last = state.shown?.[id];
  if (!last) return false;
  const days = diffDays(todayKey, last);
  return days >= 0 && days < cooldownDays;
}

function markIdShown(state: TimeState, id: TimeThresholdId, todayKey: string) {
  state.shown = state.shown || {};
  state.shown[id] = todayKey;
}

function inAllowedHours(d: Date) {
  const h = d.getHours();
  return h >= ALLOWED_HOUR_START && h < ALLOWED_HOUR_END;
}

function isBigMoment(id: TimeThresholdId) {
  return id === 'return.after_21' || id === 'streak.21';
}

function computeProbability(params: {
  id: TimeThresholdId;
  daysSinceLast: number | null;
  daysSinceLastTimeLine: number | null;
  streak: number | undefined;
  weekCount: number | undefined;
}) {
  const { id, daysSinceLast, daysSinceLastTimeLine, streak, weekCount } = params;

  let p = BASE_FIRE_PROBABILITY;

  // Cadence memory: if the user hasn't seen a time-line in a while, gently increase likelihood.
  // If a time-line was seen very recently, bias toward silence.
  if (typeof daysSinceLastTimeLine === 'number') {
    if (daysSinceLastTimeLine >= 14) p += 0.10;
    else if (daysSinceLastTimeLine >= 10) p += 0.08;
    else if (daysSinceLastTimeLine >= 7) p += 0.06;
    else if (daysSinceLastTimeLine <= 3) p -= 0.06;
    else if (daysSinceLastTimeLine <= 5) p -= 0.03;
  }

  // Weight by salience: rarer moments should be more likely to surface when eligible.
  if (id === 'return.after_21') p += 0.35;
  else if (id === 'return.after_week') p += 0.28;
  else if (id === 'return.after_gap') p += 0.20;

  if (id === 'streak.21') p += 0.30;
  else if (id === 'streak.14') p += 0.22;
  else if (id === 'streak.7') p += 0.18;
  else if (id === 'streak.3') p += 0.12;

  if (id === 'week.5') p += 0.18;
  if (id === 'return.next_day') p += 0.08;

  // Small dynamic nudges based on context
  if (typeof daysSinceLast === 'number') {
    if (daysSinceLast >= 21) p += 0.08;
    else if (daysSinceLast >= 7) p += 0.06;
    else if (daysSinceLast >= 3) p += 0.04;
  }
  if (typeof streak === 'number') {
    if (streak >= 21) p += 0.06;
    else if (streak >= 14) p += 0.05;
    else if (streak >= 7) p += 0.04;
  }
  if (typeof weekCount === 'number' && weekCount >= 5) p += 0.03;

  // Clamp so it never becomes "guaranteed" unless it’s truly rare.
  // Big moments can approach certainty; everything else stays less than 0.75.
  const max = isBigMoment(id) ? 0.95 : 0.70;
  if (p > max) p = max;
  if (p < 0.05) p = 0.05;
  return p;
}

function passesGate(p: number) {
  return Math.random() < p;
}

// Backwards-compatible shape (renamed)
export type TimeTickResult = {
  line: string | null;
  id: TimeThresholdId | null;
  state: TimeState;
};

/**
 * Evaluate time-based thresholds.
 * Call on Home focus / app open.
 */
export async function tick(ctx: TimeContext = {}): Promise<TimeTickResult> {
  const nowMs = typeof ctx.nowMs === 'number' ? ctx.nowMs : Date.now();

  const now = new Date(nowMs);
  const todayKey = localDateKey(now);

  const state = await loadState();

  const prevDate = state.lastDate ?? null;
  const daysSinceLast = prevDate ? diffDays(todayKey, prevDate) : null;
  const prevTimeLineDate = state.lastTimeLineDate ?? null;
  const daysSinceLastTimeLine = prevTimeLineDate ? diffDays(todayKey, prevTimeLineDate) : null;

  // ---- Update streak ----
  if (!prevDate) {
    // First ever open
    state.streak = state.streak ?? 1;
  } else if (daysSinceLast === 0) {
    // Same calendar day: do not change streak
  } else if (daysSinceLast === 1) {
    state.streak = (state.streak ?? 1) + 1;
  } else if (typeof daysSinceLast === 'number' && daysSinceLast > 1) {
    // Gap breaks streak
    state.streak = 1;
  }

  // ---- Update weekly cadence ----
  const weekStart = startOfWeekMondayKey(now);
  if (!state.weekStart || state.weekStart !== weekStart) {
    // New week
    state.weekStart = weekStart;
    state.weekCount = 1;
  } else {
    // Same week: count only once per calendar day
    if (prevDate && prevDate !== todayKey) {
      state.weekCount = (state.weekCount ?? 0) + 1;
    } else if (!prevDate) {
      state.weekCount = state.weekCount ?? 1;
    }
  }

  // Update last-open markers
  state.lastOpenAt = nowMs;
  state.lastDate = todayKey;

  // ---- Decide which line (if any) ----
  let chosenId: TimeThresholdId | null = null;

  if (canShowLine(nowMs, state, todayKey)) {
    // Priority order: rarer / more meaningful first.

    // Returns after longer gaps (cooldown: 14 days)
    if (typeof daysSinceLast === 'number') {
      if (daysSinceLast >= GAP_DAYS_21 && !idShownRecently(state, 'return.after_21', todayKey, 14)) {
        chosenId = 'return.after_21';
      } else if (daysSinceLast >= GAP_DAYS_WEEK && !idShownRecently(state, 'return.after_week', todayKey, 14)) {
        chosenId = 'return.after_week';
      } else if (daysSinceLast >= GAP_DAYS_TRIGGER && !idShownRecently(state, 'return.after_gap', todayKey, 7)) {
        chosenId = 'return.after_gap';
      }
    }

    // Streak milestones (cooldown: 30 days)
    if (!chosenId && typeof state.streak === 'number') {
      if (state.streak === STREAK_21 && !idShownRecently(state, 'streak.21', todayKey, 30)) chosenId = 'streak.21';
      else if (state.streak === STREAK_14 && !idShownRecently(state, 'streak.14', todayKey, 30)) chosenId = 'streak.14';
      else if (state.streak === STREAK_7 && !idShownRecently(state, 'streak.7', todayKey, 30)) chosenId = 'streak.7';
      else if (state.streak === STREAK_3 && !idShownRecently(state, 'streak.3', todayKey, 30)) chosenId = 'streak.3';
    }

    // Weekly cadence (cooldown: 14 days)
    if (!chosenId && typeof state.weekCount === 'number' && state.weekCount === WEEK_SESSIONS_5) {
      if (!idShownRecently(state, 'week.5', todayKey, 14)) chosenId = 'week.5';
    }

    // Next-day return (cooldown: 7 days)
    if (!chosenId && typeof daysSinceLast === 'number' && daysSinceLast === 1) {
      if (!idShownRecently(state, 'return.next_day', todayKey, 7)) chosenId = 'return.next_day';
    }
  }

  if (chosenId) {
    // Quiet window: don’t speak at odd hours
    if (!inAllowedHours(now)) {
      await saveState(state);
      return { line: null, id: null, state };
    }

    // Silence bias after big moments
    if (state.lastBigTimeLineDate) {
      const quietDays = diffDays(todayKey, state.lastBigTimeLineDate);
      if (quietDays >= 0 && quietDays < BIG_MOMENT_SILENCE_DAYS) {
        await saveState(state);
        return { line: null, id: null, state };
      }
    }

    // Probability gate (eligibility ≠ certainty)
    const p = computeProbability({
      id: chosenId,
      daysSinceLast: typeof daysSinceLast === 'number' ? daysSinceLast : null,
      daysSinceLastTimeLine: typeof daysSinceLastTimeLine === 'number' ? daysSinceLastTimeLine : null,
      streak: state.streak,
      weekCount: state.weekCount,
    });

    if (!passesGate(p)) {
      await saveState(state);
      return { line: null, id: null, state };
    }

    markLineShown(state, nowMs, todayKey);
    markIdShown(state, chosenId, todayKey);

    // Mark big moments to create silence afterward
    if (isBigMoment(chosenId)) {
      state.lastBigTimeLineAt = nowMs;
      state.lastBigTimeLineDate = todayKey;
    }

    await saveState(state);
    return { line: COPY[chosenId], id: chosenId, state };
  }

  await saveState(state);
  return { line: null, id: null, state };
}

// Backwards-compatible alias
export const evaluateTimeThreshold = async (nowMs: number = Date.now()) => tick({ nowMs });

export async function getState(): Promise<TimeState> {
  return loadState();
}

// Backwards-compatible alias
export const getTimeState = getState;

export async function reset(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TIME_STATE_KEY);
  } catch {
    // ignore
  }
}

// Backwards-compatible alias
export const resetTimeState = reset;

/** Dev helper: force a threshold line for testing UI */
export function devForce(id: TimeThresholdId): string {
  return COPY[id];
}

// Backwards-compatible alias
export const devGetLine = devForce;

// Named engine-style export for convenient imports in screens
export const TimeEngine = {
  tick,
  getState,
  reset,
  devForce,
};
