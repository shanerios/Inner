import type { LucidSignalReflection } from './lucidSignalLearning';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CompiledAudioJourneyTimeline,
  NativeAudioDiagnosticEvent,
  NoiseColor,
  ProceduralAudioConfig,
  ProceduralEnvironment,
} from './audio';

export const JOURNEY_MEMORY_KEY = 'inner.journey-memory.v1';
export const JOURNEY_MEMORY_SCHEMA_VERSION = 2 as const;

const MAX_SESSIONS = 60;
const MAX_EVENTS_PER_SESSION = 240;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

/**
 * `os_terminated` is reserved for cases where a native signal specifically
 * attributes the death to the OS (e.g. a trim-memory callback caught before
 * the kill) -- Android does not hand back a reliable "the OS killed me"
 * reason in the general case, so checkpoint reconciliation alone will
 * usually land on `recovered_interrupted`/`abandoned_interrupted`/`unknown`
 * rather than this value. It exists so a more specific signal has somewhere
 * to go later without another schema bump.
 */
export type JourneyMemoryOutcome =
  | 'completed'
  | 'user_stopped'
  | 'recovered_interrupted'
  | 'abandoned_interrupted'
  | 'os_terminated'
  | 'failed'
  | 'unknown';
export type JourneyMemoryEventType =
  | 'started'
  | 'stage_changed'
  | 'cue_played'
  | 'recognition_signal_selected'
  | 'recognition_signal_fired'
  | 'seeked'
  | 'app_state_changed'
  | 'playback_paused'
  | 'playback_resumed'
  | 'audio_route_changed'
  | 'interruption_began'
  | 'interruption_ended'
  | 'audio_underrun'
  | 'completed'
  | 'user_stopped'
  | 'recovered_interrupted'
  | 'abandoned_interrupted'
  | 'os_terminated'
  | 'unknown'
  | 'error';

const OUTCOME_EVENT_TYPE: Record<JourneyMemoryOutcome, JourneyMemoryEventType> = {
  completed: 'completed',
  user_stopped: 'user_stopped',
  recovered_interrupted: 'recovered_interrupted',
  abandoned_interrupted: 'abandoned_interrupted',
  os_terminated: 'os_terminated',
  failed: 'error',
  unknown: 'unknown',
};

const OUTCOME_END_REASON: Record<JourneyMemoryOutcome, NonNullable<JourneyMemorySession['endReason']>> = {
  completed: 'timeline_completed',
  user_stopped: 'manual_stop',
  recovered_interrupted: 'recovered',
  abandoned_interrupted: 'interrupted',
  os_terminated: 'os_terminated',
  failed: 'playback_error',
  unknown: 'unknown',
};

export type JourneyMemoryEvent = {
  type: JourneyMemoryEventType;
  at: number;
  positionMs: number;
  stageId?: string;
  cueId?: string;
  fromPositionMs?: number;
  message?: string;
  reason?: string;
  appState?: string;
  route?: string;
  signalId?: string;
  scheduledPositionMs?: number;
  actualPositionMs?: number;
  driftMs?: number;
  underrunCount?: number;
};

export type JourneyMemorySession = {
  schemaVersion: typeof JOURNEY_MEMORY_SCHEMA_VERSION;
  id: string;
  journeyId: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  morningReflection?: { answers: LucidSignalReflection; savedAt: number };
  morningCapture?: { journalEntryId: string; savedAt: number };
  plannedDurationMs: number;
  endPolicy: CompiledAudioJourneyTimeline['endPolicy'];
  protocolVersion: number;
  seed: number;
  initialConfig: ProceduralAudioConfig;
  stages: Array<{
    id: string;
    durationMs: number;
    config: ProceduralAudioConfig;
  }>;
  outcome?: JourneyMemoryOutcome;
  endReason?: 'timeline_completed' | 'manual_stop' | 'playback_error' | 'recovered' | 'interrupted' | 'os_terminated' | 'unknown';
  actualDurationMs?: number;
  elapsedWallTimeMs?: number;
  /** QA sessions exercise persistence and UI but never contribute preference evidence. */
  testSession?: boolean;
  events: JourneyMemoryEvent[];
};

export type JourneyMemoryState = {
  schemaVersion: typeof JOURNEY_MEMORY_SCHEMA_VERSION;
  sessions: JourneyMemorySession[];
};

export type JourneyMemoryProfile = {
  sessionsObserved: number;
  completedSessions: number;
  completionRate: number;
  typicalCompletedDurationMs: number | null;
  mostRepeatedJourneyId: string | null;
  preferredEnvironment: ProceduralEnvironment | null;
  preferredNoiseColor: NoiseColor | null;
  seekRate: number;
  confidence: 'forming' | 'early' | 'established';
};

const EMPTY_STATE: JourneyMemoryState = {
  schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
  sessions: [],
};

let writeQueue: Promise<unknown> = Promise.resolve();

function validSession(value: unknown): value is JourneyMemorySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<JourneyMemorySession>;
  return session.schemaVersion === JOURNEY_MEMORY_SCHEMA_VERSION
    && typeof session.id === 'string'
    && typeof session.journeyId === 'string'
    && typeof session.title === 'string'
    && typeof session.startedAt === 'number'
    && typeof session.plannedDurationMs === 'number'
    && Array.isArray(session.stages)
    && Array.isArray(session.events);
}

/** Upgrades a v1-shaped session (pre-taxonomy-split) in place; a no-op for v2. */
function migrateSessionToCurrentSchema(session: any): unknown {
  if (!session || typeof session !== 'object') return session;
  const outcome = session.outcome === 'left_early' ? 'user_stopped' : session.outcome;
  const events = Array.isArray(session.events)
    ? session.events.map((event: any) => (event?.type === 'left_early' ? { ...event, type: 'user_stopped' } : event))
    : session.events;
  return { ...session, schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION, outcome, events };
}

export async function loadJourneyMemory(storage: Storage = AsyncStorage): Promise<JourneyMemoryState> {
  try {
    const raw = await storage.getItem(JOURNEY_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.sessions)) return EMPTY_STATE;
    // Only migrate a known prior version forward; an unrecognized future
    // version is safer to ignore than to guess at.
    if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== JOURNEY_MEMORY_SCHEMA_VERSION) return EMPTY_STATE;
    return {
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      sessions: parsed.sessions.map(migrateSessionToCurrentSchema).filter(validSession).slice(0, MAX_SESSIONS),
    };
  } catch {
    return EMPTY_STATE;
  }
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

export function beginJourneyMemorySession(
  journeyId: string,
  timeline: CompiledAudioJourneyTimeline,
  initialConfig: ProceduralAudioConfig,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<JourneyMemorySession> {
  return enqueue(async () => {
    const startedAt = now();
    const session: JourneyMemorySession = {
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      id: `journey-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
      journeyId,
      title: timeline.title,
      startedAt,
      plannedDurationMs: timeline.totalDurationMs,
      endPolicy: timeline.endPolicy,
      protocolVersion: timeline.protocolVersion,
      seed: timeline.seed,
      initialConfig,
      stages: timeline.stages.map(stage => ({
        id: stage.id,
        durationMs: stage.durationMs,
        config: stage.config,
      })),
      events: [{ type: 'started', at: startedAt, positionMs: 0 }],
    };
    const state = await loadJourneyMemory(storage);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      sessions: [session, ...state.sessions].slice(0, MAX_SESSIONS),
    }));
    return session;
  });
}

/** Creates a completed Lab-only night so Morning Return can be tested immediately. */
export function createMorningReturnTestSession(
  initialConfig: ProceduralAudioConfig,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<JourneyMemorySession> {
  return enqueue(async () => {
    const endedAt = now();
    const plannedDurationMs = 60_000;
    const startedAt = endedAt - plannedDurationMs;
    const session: JourneyMemorySession = {
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      id: `journey-qa-${endedAt}-${Math.random().toString(36).slice(2, 8)}`,
      journeyId: 'overnight-recognition-forest-qa',
      title: 'Morning Return QA · Forest',
      startedAt,
      endedAt,
      plannedDurationMs,
      endPolicy: 'protocolControlled',
      protocolVersion: 1,
      seed: 0,
      initialConfig,
      stages: [{ id: 'qa-forest-return', durationMs: plannedDurationMs, config: initialConfig }],
      outcome: 'completed',
      endReason: 'timeline_completed',
      actualDurationMs: plannedDurationMs,
      elapsedWallTimeMs: plannedDurationMs,
      testSession: true,
      events: [
        { type: 'started', at: startedAt, positionMs: 0 },
        { type: 'completed', at: endedAt, positionMs: plannedDurationMs },
      ],
    };
    const state = await loadJourneyMemory(storage);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      sessions: [session, ...state.sessions].slice(0, MAX_SESSIONS),
    }));
    return session;
  });
}

export function recordJourneyMemoryEvent(
  sessionId: string,
  event: Omit<JourneyMemoryEvent, 'at'> & { at?: number },
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<void> {
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage);
    const sessions = state.sessions.map(session => session.id === sessionId
      ? {
          ...session,
          events: [...session.events, { ...event, at: event.at ?? now() }]
            .slice(-MAX_EVENTS_PER_SESSION),
        }
      : session);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ ...state, sessions }));
  });
}

export function finishJourneyMemorySession(
  sessionId: string,
  outcome: JourneyMemoryOutcome,
  positionMs: number,
  message?: string,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<void> {
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage);
    const endedAt = now();
    const sessions = state.sessions.map(session => {
      if (session.id !== sessionId || session.endedAt) return session;
      const event: JourneyMemoryEvent = {
        type: OUTCOME_EVENT_TYPE[outcome],
        at: endedAt,
        positionMs,
        ...(message ? { message } : {}),
      };
      return {
        ...session,
        endedAt,
        outcome,
        endReason: OUTCOME_END_REASON[outcome],
        actualDurationMs: Math.max(0, positionMs),
        elapsedWallTimeMs: Math.max(0, endedAt - session.startedAt),
        events: [...session.events, event].slice(-MAX_EVENTS_PER_SESSION),
      };
    });
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ ...state, sessions }));
  });
}

/**
 * Builds an explainable, read-only preference profile from recent behavior.
 * This never changes a journey by itself; product surfaces must ask the user
 * before applying any future recommendation derived from it.
 */
export function deriveJourneyMemoryProfile(
  memory: JourneyMemoryState,
  sampleSize = 12,
): JourneyMemoryProfile | null {
  const observed = memory.sessions
    // Engine failures are diagnostics, not evidence about the listener.
    .filter(session => !session.testSession)
    .filter(session => !session.journeyId.startsWith('dev-test-'))
    // Interrupted outcomes remain useful diagnostics, but only an explicit
    // native completion is strong enough to influence personalization.
    .filter(session => session.outcome === 'completed'
      || session.outcome === 'user_stopped')
    .slice(0, sampleSize);
  if (!observed.length) return null;

  const completed = observed.filter(session => session.outcome === 'completed');
  const journeyCounts = new Map<string, number>();
  const environmentDurations = new Map<ProceduralEnvironment, number>();
  const noiseDurations = new Map<NoiseColor, number>();

  for (const session of completed) {
    journeyCounts.set(session.journeyId, (journeyCounts.get(session.journeyId) ?? 0) + 1);
    for (const stage of session.stages) {
      if (stage.config.environment !== 'none' && stage.config.environmentGain > 0) {
        environmentDurations.set(
          stage.config.environment,
          (environmentDurations.get(stage.config.environment) ?? 0) + stage.durationMs,
        );
      }
      if (stage.config.noiseColor && stage.config.noiseGain > 0) {
        noiseDurations.set(
          stage.config.noiseColor,
          (noiseDurations.get(stage.config.noiseColor) ?? 0) + stage.durationMs,
        );
      }
    }
  }

  const strongest = <T extends string>(values: Map<T, number>): T | null => {
    let result: T | null = null;
    let highest = 0;
    for (const [value, weight] of values) {
      if (weight > highest) {
        result = value;
        highest = weight;
      }
    }
    return result;
  };
  const completedDurations = completed
    .map(session => session.plannedDurationMs)
    .sort((a, b) => a - b);
  const middle = Math.floor(completedDurations.length / 2);
  const typicalCompletedDurationMs = !completedDurations.length
    ? null
    : completedDurations.length % 2
      ? completedDurations[middle]
      : Math.round((completedDurations[middle - 1] + completedDurations[middle]) / 2);
  const repeatedJourney = [...journeyCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const seekCount = observed.reduce(
    (total, session) => total + session.events.filter(event => event.type === 'seeked').length,
    0,
  );

  return {
    sessionsObserved: observed.length,
    completedSessions: completed.length,
    completionRate: completed.length / observed.length,
    typicalCompletedDurationMs,
    mostRepeatedJourneyId: repeatedJourney?.[1] >= 2 ? repeatedJourney[0] : null,
    preferredEnvironment: strongest(environmentDurations),
    preferredNoiseColor: strongest(noiseDurations),
    seekRate: seekCount / observed.length,
    confidence: observed.length >= 8 ? 'established' : observed.length >= 3 ? 'early' : 'forming',
  };
}

/** The planned end opens review; it is never evidence of native completion. */
export function pendingOvernightReflection(memory: JourneyMemoryState, now = Date.now()): JourneyMemorySession | null {
  return memory.sessions.find(session =>
    session.journeyId.startsWith('overnight-recognition-')
    && session.endPolicy === 'protocolControlled'
    && session.outcome !== 'failed'
    && !session.morningReflection
    && session.startedAt + session.plannedDurationMs <= now
  ) ?? null;
}

export function saveOvernightReflection(
  sessionId: string,
  answers: LucidSignalReflection,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<void> {
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage);
    const session = state.sessions.find(item => item.id === sessionId);
    if (!session || pendingOvernightReflection({ ...state, sessions: [session] }, now()) === null) {
      throw new Error('This overnight session is no longer available for reflection.');
    }
    const sessions = state.sessions.map(item => item.id === sessionId
      ? { ...item, morningReflection: { answers, savedAt: now() } }
      : item);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ ...state, sessions }));
  });
}

export function saveOvernightMorningCapture(
  sessionId: string,
  journalEntryId: string,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<void> {
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage);
    const session = state.sessions.find(item => item.id === sessionId);
    if (!session || pendingOvernightReflection({ ...state, sessions: [session] }, now()) === null) {
      throw new Error('This overnight session is no longer available for morning capture.');
    }
    const sessions = state.sessions.map(item => item.id === sessionId
      ? { ...item, morningCapture: { journalEntryId, savedAt: now() } }
      : item);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ ...state, sessions }));
  });
}

// ── Durable checkpoint reconciliation (Android process death) ──────────────
//
// The native side persists a small checkpoint (position, fired-signal
// ledger, last-write time) to disk independently of this JS layer, so it
// survives the process being killed outright. This reconciles that
// checkpoint into a real outcome the next time the app launches, instead of
// leaving the session open forever with no explanation.

export type JourneyMemoryCheckpoint = {
  sessionId: string;
  positionMs: number;
  lastUpdatedAt: number;
  firedSignalIds: string[];
  plannedSignalCount?: number;
  /** Diagnostics recorded natively after the last drain the JS side ever saw. */
  pendingDiagnostics?: NativeAudioDiagnosticEvent[];
};

/**
 * Reconciles one native checkpoint into a terminal outcome. Only acts on a
 * session that is genuinely still open (no `endedAt`) -- a checkpoint left
 * over from a session that already finished cleanly (and should have been
 * cleared natively) or was already reconciled once is left untouched.
 * Returns the outcome it assigned, or null if there was nothing to do.
 */
export async function reconcileInterruptedJourneyMemorySession(
  checkpoint: JourneyMemoryCheckpoint,
  storage: Storage = AsyncStorage,
  now: () => number = Date.now,
): Promise<JourneyMemoryOutcome | null> {
  // Not wrapped in enqueue() itself: finishJourneyMemorySession below already
  // enqueues its own write (and re-checks !endedAt at write time), so nesting
  // this in another enqueue() call would deadlock the shared write queue.
  const state = await loadJourneyMemory(storage);
  const session = state.sessions.find(item => item.id === checkpoint.sessionId);
  if (!session || session.endedAt) return null;

  // Allow only the native checkpoint cadence plus a small scheduling margin.
  // A percentage threshold could misclassify many missing minutes overnight.
  const nearPlannedEnd = checkpoint.positionMs >= session.plannedDurationMs - 30_000;
  const allSignalsFired = checkpoint.plannedSignalCount != null
    && checkpoint.firedSignalIds.length >= checkpoint.plannedSignalCount;
  const outcome: JourneyMemoryOutcome = nearPlannedEnd && allSignalsFired
    ? 'recovered_interrupted'
    : checkpoint.positionMs > 0
      ? 'abandoned_interrupted'
      : 'unknown';

  for (const event of checkpoint.pendingDiagnostics ?? []) {
    await recordJourneyMemoryEvent(checkpoint.sessionId, {
      type: event.type,
      at: event.atMs,
      positionMs: checkpoint.positionMs,
      reason: event.reason,
      route: event.route,
      signalId: event.signalId,
      scheduledPositionMs: event.scheduledPositionMs,
      actualPositionMs: event.actualPositionMs,
      driftMs: event.driftMs,
      underrunCount: event.underrunCount,
    }, storage, now);
  }

  const staleSeconds = Math.max(0, Math.round((now() - checkpoint.lastUpdatedAt) / 1_000));
  await finishJourneyMemorySession(
    checkpoint.sessionId,
    outcome,
    checkpoint.positionMs,
    `reconciled from checkpoint (last written ${staleSeconds}s before relaunch, ${checkpoint.firedSignalIds.length}${checkpoint.plannedSignalCount != null ? `/${checkpoint.plannedSignalCount}` : ''} signals fired)`,
    storage,
    now,
  );
  return outcome;
}
