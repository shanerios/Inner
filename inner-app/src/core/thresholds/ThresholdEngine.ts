// src/core/thresholds/ThresholdEngine.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThresholdMoment =
  | 'return.after_absence'
  | 'quickcalm.returner'
  | 'chamber4.completed'
  | 'chamber5.completed'
  | 'presence.recognized'
  | 'intentions.retuned'
  | 'rare.once'
  | 'day5.shape';

export type ThresholdContext = {
  // time / app usage
  nowMs?: number; // default Date.now()
  lastOpenedAtMs?: number | null; // read from your app state/storage
  daysSinceLastUse?: number | null; // optional (if you already compute it)

  // usage counters
  quickCalmTotal?: number | null; // lifetime total
  openedDaysCount?: number | null; // number of distinct days opened (not streak)

  // events
  event?:
    | { type: 'app_open' }
    | { type: 'quick_calm' }
    | { type: 'chamber_complete'; chamberId: string }
    | { type: 'intentions_retuned' }
    | { type: 'ritual_complete'; ritualId: string };
};

export type ThresholdPayload = {
  line: string;
  id: ThresholdMoment;
  source: 'threshold';
};

async function queuePayload(p: ThresholdPayload): Promise<void> {
  // HomeScreen supports both raw strings and JSON payloads; we now prefer JSON.
  await safeSet(PENDING_LINE_KEY, JSON.stringify(p));
}

const KEY_PREFIX = 'inner.threshold.';
const SESSION_GUARD_KEY = 'inner.threshold.sessionFired.v1'; // prevents spamming in one session
const PENDING_LINE_KEY = 'inner.threshold.pendingLine.v1'; // consumed by HomeScreen overlay

const DEFERRED_KEY = 'inner.threshold.deferred.v1';

// Silence gate tuning: eligible moments are sometimes held or skipped.
const FIRE_NOW_PROB = 0.55; // if eligible, 55% fire now
const DEFER_PROB = 0.30; // if eligible, 30% defer for later
// remaining probability = silent skip

// TTLs (ms): how long a deferred moment stays valid before it expires and can be re-earned.
const TTL = {
  chamber_complete: 6 * 60 * 60 * 1000, // 6 hours
  intentions_retuned: 12 * 60 * 60 * 1000, // 12 hours
  quick_calm: 24 * 60 * 60 * 1000, // 24 hours
  app_open: 48 * 60 * 60 * 1000, // 48 hours
};

type DeferredRecord = {
  payload: ThresholdPayload;
  createdAt: number;
  expiresAt: number;
};

async function getDeferred(): Promise<DeferredRecord | null> {
  const raw = await safeGet(DEFERRED_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.payload?.line || !parsed?.payload?.id) return null;
    return parsed as DeferredRecord;
  } catch {
    return null;
  }
}

async function setDeferred(rec: DeferredRecord): Promise<void> {
  await safeSet(DEFERRED_KEY, JSON.stringify(rec));
}

async function clearDeferred(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEFERRED_KEY);
  } catch {
    // ignore
  }
}

function decideEligibleAction(m: ThresholdMoment) {
  // Chamber completions should be more likely to speak.
  const isChamber = m === 'chamber4.completed' || m === 'chamber5.completed';
  const fireProb = isChamber ? Math.min(0.75, FIRE_NOW_PROB + 0.12) : FIRE_NOW_PROB;

  const r = Math.random();
  if (r < fireProb) return 'fire' as const;
  if (r < fireProb + DEFER_PROB) return 'defer' as const;
  return 'skip' as const;
}

function ttlForCtx(ctx: ThresholdContext, m: ThresholdMoment) {
  const t = ctx.event?.type;
  if (t === 'chamber_complete') return TTL.chamber_complete;
  if (t === 'intentions_retuned') return TTL.intentions_retuned;
  if (t === 'quick_calm') return TTL.quick_calm;
  return TTL.app_open;
}

// You can tweak these safely:
const QUICKCALM_RETURNER_AT = 7;
const RETURN_AFTER_ABSENCE_DAYS = 5;
const PRESENCE_RECOGNIZED_OPEN_DAYS = 3;

// Rare, once-ever threshold (silent mythic whisper)
const RARE_ONCE_PROB = 0.03; // 3% chance on eligible arrivals
const RARE_ONCE_REQUIRE_OPEN_DAYS = 3; // multi-day
const RARE_ONCE_REQUIRE_CHAMBERS_SEEN = 2; // multi-chamber

// Day-5 eligibility: a subtle first-week inflection (not guaranteed)
const DAY5_SHAPE_PROB = 0.12; // 12% chance on eligible home arrivals
const DAY5_SHAPE_REQUIRE_OPEN_DAYS = 5;

// If another threshold fires before day5.shape ever fires, day5.shape dissolves and will never appear.
const DAY5_SHAPE_DISSOLVED_KEY = 'inner.threshold.day5.shape.dissolved.v1';

const CHAMBERS_SEEN_KEY = 'inner.threshold.chambersSeen.v1';

const COPY: Record<ThresholdMoment, string[]> = {
  'return.after_absence': [
    'Welcome back.',
    'You returned. That matters.',
    'The door opens again.',
    'You’re here.',
  ],
  'quickcalm.returner': [
    'You’re learning how to return.',
    'You found the center again.',
    'You remembered the way back.',
    'The field settles when you do.',
  ],
  'chamber4.completed': [
    'Your body remembers this place.',
    'You crossed the threshold.',
    'The rhythm held you.',
  ],
  'chamber5.completed': [
    'Something has shifted.',
    'A new tone is in you now.',
    'You brought something back.',
  ],
  'presence.recognized': [
    'Inner recognizes your presence.',
    'You are being witnessed.',
    'The thread holds.',
    'You’ve been here before.',
  ],
  'intentions.retuned': [
    'It’s okay to change direction.',
    'A new alignment is allowed.',
    'Your path can soften and still be true.',
    'You can retune without losing progress.',
  ],
  'day5.shape': [
    'Something has begun to take shape.',
  ],
  'rare.once': [
    'Some things only show themselves once.',
    'This was happening before you arrived.',
    'Your presence changed something.',
    'What you did left a mark.',
    'The field widened.',
    'This is where you arrived.',
  ],
};

function momentKey(m: ThresholdMoment) {
  return `${KEY_PREFIX}${m}.v1`;
}

function variantKey(m: ThresholdMoment) {
  return `${KEY_PREFIX}${m}.variantsUsed.v1`;
}

async function safeGetJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await safeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function safeSetJSON(key: string, value: any): Promise<void> {
  await safeSet(key, JSON.stringify(value));
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

async function alreadyFiredThisSession(): Promise<boolean> {
  const v = await safeGet(SESSION_GUARD_KEY);
  return v === 'true' || v === '1';
}

async function markFiredThisSession(): Promise<void> {
  await safeSet(SESSION_GUARD_KEY, 'true');
}

/**
 * Call this on app start / cold start (optional).
 * If you already clear session state elsewhere, you can skip this.
 */
export async function resetThresholdSessionGuard(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_GUARD_KEY);
  } catch {
    // ignore
  }
}

async function hasFired(m: ThresholdMoment): Promise<boolean> {
  const v = await safeGet(momentKey(m));
  return v === 'true' || v === '1';
}

async function isDay5ShapeDissolved(): Promise<boolean> {
  const v = await safeGet(DAY5_SHAPE_DISSOLVED_KEY);
  return v === 'true' || v === '1';
}

async function dissolveDay5Shape(): Promise<void> {
  await safeSet(DAY5_SHAPE_DISSOLVED_KEY, 'true');
}

async function getChambersSeen(): Promise<string[]> {
  const arr = await safeGetJSON<string[]>(CHAMBERS_SEEN_KEY, []);
  return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.length > 0) : [];
}

async function noteChamberSeen(chamberId: string): Promise<void> {
  const id = (chamberId || '').trim();
  if (!id) return;

  const seen = await getChambersSeen();
  if (seen.includes(id)) return;

  seen.push(id);
  await safeSetJSON(CHAMBERS_SEEN_KEY, seen);
}

async function pickVariant(m: ThresholdMoment): Promise<string> {
  const pool = COPY[m] || [];
  if (pool.length === 0) return '';

  // used = array of indices already shown
  let used = await safeGetJSON<number[]>(variantKey(m), []);
  used = Array.isArray(used) ? used.filter((n) => Number.isInteger(n) && n >= 0 && n < pool.length) : [];

  // reset when exhausted
  if (used.length >= pool.length) {
    used = [];
  }

  const remaining: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (!used.includes(i)) remaining.push(i);
  }

  const idx = remaining[Math.floor(Math.random() * remaining.length)];
  used.push(idx);
  await safeSetJSON(variantKey(m), used);

  return pool[idx];
}

async function buildPayload(m: ThresholdMoment): Promise<ThresholdPayload> {
  const line = (await pickVariant(m)).trim();
  return { line: line.length ? line : ' ', id: m, source: 'threshold' };
}

async function fire(m: ThresholdMoment): Promise<ThresholdPayload> {
  // If ANY other threshold fires before day5.shape has ever fired, suppress day5.shape permanently.
  if (m !== 'day5.shape') {
    try {
      const firedDay5 = await hasFired('day5.shape');
      if (!firedDay5) {
        await dissolveDay5Shape();
        const d = await getDeferred();
        if (d?.payload?.id === 'day5.shape') {
          await clearDeferred();
        }
      }
    } catch {
      // ignore
    }
  }

  await safeSet(momentKey(m), 'true');
  await markFiredThisSession();
  return buildPayload(m);
}

/**
 * Preferred API: returns a structured payload (line + id + source), or null.
 * Rule: at most ONE threshold fires per app session.
 */
export async function maybeGetThresholdPayload(ctx: ThresholdContext): Promise<ThresholdPayload | null> {
  // Don’t spam: only one threshold per session.
  if (await alreadyFiredThisSession()) return null;

  const event = ctx.event?.type;

  // Track distinct chambers completed (for rare.once gating). This is not a threshold itself.
  if (event === 'chamber_complete') {
    const chamberId = ctx.event?.type === 'chamber_complete' ? ctx.event.chamberId : '';
    // Fire-and-forget: tracking should never crash threshold evaluation.
    try {
      await noteChamberSeen(chamberId);
    } catch {}
  }

  // Deferred delivery: if we held a moment, try to deliver it on app_open / home arrival.
  if (event === 'app_open' || event == null) {
    const d = await getDeferred();
    if (d) {
      const now = Date.now();
      if (now > d.expiresAt) {
        // expired → clear; it can be re-earned later
        await clearDeferred();
      } else {
        // deliver deferred now (and mark as fired only now)
        // If day5.shape has dissolved, do not deliver it.
        if (d.payload.id === 'day5.shape' && (await isDay5ShapeDissolved())) {
          await clearDeferred();
          return null;
        }

        await clearDeferred();
        await safeSet(momentKey(d.payload.id), 'true');
        await markFiredThisSession();
        return d.payload;
      }
    }
  }

  const handleEligible = async (m: ThresholdMoment) => {
    // rare.once is once-ever and must never defer/expire.
    if (m === 'rare.once') {
      return fire(m);
    }

    // day5.shape should never defer. It either lands now or dissolves later.
    if (m === 'day5.shape') {
      const action = decideEligibleAction(m);
      if (action === 'fire') return fire(m);
      return null;
    }

    const action = decideEligibleAction(m);
    if (action === 'fire') return fire(m);

    if (action === 'defer') {
      // Keep only one deferred record at a time to avoid backlog.
      const existing = await getDeferred();
      if (!existing) {
        const payload = await buildPayload(m);
        const now = Date.now();
        await setDeferred({
          payload,
          createdAt: now,
          expiresAt: now + ttlForCtx(ctx, m),
        });
      }
    }

    return null;
  };

  // --- Highest priority: completions that imply “crossing” ---
  if (event === 'chamber_complete') {
    const chamberId = ctx.event?.type === 'chamber_complete' ? ctx.event.chamberId : '';
    if (chamberId === 'chamber04' || chamberId === '4') {
      if (!(await hasFired('chamber4.completed'))) return await handleEligible('chamber4.completed');
    }
    if (chamberId === 'chamber05' || chamberId === '5') {
      if (!(await hasFired('chamber5.completed'))) return await handleEligible('chamber5.completed');
    }
  }

  // --- Intentions retune ---
  if (event === 'intentions_retuned') {
    if (!(await hasFired('intentions.retuned'))) return await handleEligible('intentions.retuned');
  }

  // --- Quick Calm returner ---
  if (event === 'quick_calm') {
    const total = ctx.quickCalmTotal ?? null;
    if (typeof total === 'number' && total >= QUICKCALM_RETURNER_AT) {
      if (!(await hasFired('quickcalm.returner'))) return await handleEligible('quickcalm.returner');
    }
  }

  // --- App open / home arrival thresholds ---
  if (event === 'app_open' || event == null) {
    // Return after absence
    const daysSince = typeof ctx.daysSinceLastUse === 'number' ? ctx.daysSinceLastUse : null;

    if (typeof daysSince === 'number' && daysSince >= RETURN_AFTER_ABSENCE_DAYS) {
      if (!(await hasFired('return.after_absence'))) return await handleEligible('return.after_absence');
    }

    // Presence recognized (distinct open days)
    const openedDays = ctx.openedDaysCount ?? null;
    if (typeof openedDays === 'number' && openedDays >= PRESENCE_RECOGNIZED_OPEN_DAYS) {
      if (!(await hasFired('presence.recognized'))) return await handleEligible('presence.recognized');
    }

    // Day-5 inflection: eligible starting on the 5th distinct open day.
    if (!(await hasFired('day5.shape')) && !(await isDay5ShapeDissolved())) {
      const od = typeof openedDays === 'number' ? openedDays : null;
      if (typeof od === 'number' && od >= DAY5_SHAPE_REQUIRE_OPEN_DAYS) {
        if (Math.random() < DAY5_SHAPE_PROB) {
          return await handleEligible('day5.shape');
        }
      }
    }

    // --- Rare, once-ever whisper (no deferral, no expiry, no repeat) ---
    // Gate: multi-day + multi-chamber, plus a low probability roll.
    if (!(await hasFired('rare.once'))) {
      const od = typeof openedDays === 'number' ? openedDays : null;
      if (typeof od === 'number' && od >= RARE_ONCE_REQUIRE_OPEN_DAYS) {
        const seen = await getChambersSeen();
        if (seen.length >= RARE_ONCE_REQUIRE_CHAMBERS_SEEN) {
          if (Math.random() < RARE_ONCE_PROB) {
            return await handleEligible('rare.once');
          }
        }
      }
    }
  }

  return null;
}

/**
 * Convenience: evaluate and enqueue a threshold payload to be displayed on Home.
 * Returns the payload if queued, else null.
 */
export async function maybeQueueThreshold(ctx: ThresholdContext): Promise<ThresholdPayload | null> {
  const p = await maybeGetThresholdPayload(ctx);
  if (!p) return null;
  await queuePayload(p);
  return p;
}

export async function maybeGetThresholdLine(ctx: ThresholdContext): Promise<string | null> {
  const p = await maybeGetThresholdPayload(ctx);
  return p?.line ?? null;
}