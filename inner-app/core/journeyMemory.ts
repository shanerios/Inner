import { normalizeLucidSignalReflection, type LucidSignalReflection } from './lucidSignalLearning';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CompiledAudioJourneyTimeline,
  NativeAudioDiagnosticEvent,
  NativeProcessExitInfo,
  NativeCheckpoint,
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
export type JourneyCompletionStatus = 'completed' | 'completed_early' | 'partial' | 'abandoned';
export type JourneyMemoryEventType =
  | 'started'
  | 'stage_changed'
  | 'cue_played'
  | 'recognition_signal_selected'
  | 'recognition_signal_fired'
  | 'recognition_signal_held'
  | 'voice_clips_planned'
  | 'voice_clips_loaded'
  | 'voice_clip_started'
  | 'voice_clip_missing'
  | 'seeked'
  | 'app_state_changed'
  | 'playback_paused'
  | 'playback_resumed'
  | 'playback_stopped'
  | 'foreground_service_started'
  | 'foreground_service_stopped'
  | 'start_step'
  | 'start_stalled'
  | 'sleep_timer_fired'
  | 'audio_route_changed'
  | 'interruption_began'
  | 'interruption_ended'
  | 'audio_underrun'
  | 'previous_session_interrupted_unexpectedly'
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
  lastUpdatedAt?: number;
  engineRunning?: boolean;
  playbackState?: string;
  audioFocus?: string;
  foregroundServiceState?: string;
  desiredPlaying?: boolean;
  pauseReason?: string;
  lastStopReason?: string;
  processInstanceId?: string;
  exitReason?: string;
  exitReasonCode?: number;
  exitDescription?: string;
  exitTimestamp?: number;
  processId?: number;
  processImportance?: number;
  processStatus?: number;
  pssKb?: number;
  rssKb?: number;
};

export type JourneyMemorySession = {
  schemaVersion: typeof JOURNEY_MEMORY_SCHEMA_VERSION;
  id: string;
  nightPlanId?: string;
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
  /** Last reconciled native evidence; no audio or user-authored content. */
  nativeCheckpoint?: Omit<NativeCheckpoint, 'pendingDiagnostics'>;
  stages: Array<{
    id: string;
    durationMs: number;
    config: ProceduralAudioConfig;
  }>;
  /** Recognition presentations planned by the exact Night Recipe timeline. */
  plannedRecognitionCues?: Array<{ cueId: string; scheduledPositionMs: number }>;
  outcome?: JourneyMemoryOutcome;
  endReason?: 'timeline_completed' | 'manual_stop' | 'playback_error' | 'recovered' | 'interrupted' | 'os_terminated' | 'unknown';
  completionStatus?: JourneyCompletionStatus;
  /** Playback position divided by planned duration, clamped to 0...1. */
  progress?: number;
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

const completionProgress = (plannedDurationMs: number, positionMs: number) =>
  plannedDurationMs > 0 ? Math.min(1, Math.max(0, positionMs / plannedDurationMs)) : 0;

function completionStatusFor(
  session: Pick<JourneyMemorySession, 'endPolicy' | 'plannedDurationMs'>,
  outcome: JourneyMemoryOutcome,
  positionMs: number,
): JourneyCompletionStatus {
  const progress = completionProgress(session.plannedDurationMs, positionMs);
  if (outcome === 'completed' || outcome === 'recovered_interrupted') return 'completed';
  if (outcome === 'user_stopped') {
    // Initial fallback until protocols expose explicit required-phase criteria.
    if (session.endPolicy === 'protocolControlled' && progress >= 0.85) return 'completed_early';
    return progress > 0 ? 'partial' : 'abandoned';
  }
  if (outcome === 'abandoned_interrupted' || outcome === 'os_terminated' || outcome === 'unknown') {
    return progress > 0 ? 'partial' : 'abandoned';
  }
  return 'abandoned';
}

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
  const positionMs = typeof session.actualDurationMs === 'number'
    ? session.actualDurationMs
    : Array.isArray(events) && events.length
      ? events[events.length - 1]?.positionMs ?? 0
      : 0;
  const progress = typeof session.progress === 'number'
    ? Math.min(1, Math.max(0, session.progress))
    : completionProgress(session.plannedDurationMs, positionMs);
  const completionStatus = session.completionStatus
    ?? (outcome && session.endedAt ? completionStatusFor(session, outcome, positionMs) : undefined);
  return { ...session, schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION, outcome, events, progress, completionStatus };
}

export async function loadJourneyMemory(storage: Storage = AsyncStorage, strict = false): Promise<JourneyMemoryState> {
  try {
    const raw = await storage.getItem(JOURNEY_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!raw) return EMPTY_STATE;
    if (!parsed || !Array.isArray(parsed.sessions)) {
      if (strict) throw new Error('Invalid Journey Memory');
      return EMPTY_STATE;
    }
    // Only migrate a known prior version forward; an unrecognized future
    // version is safer to ignore than to guess at.
    if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== JOURNEY_MEMORY_SCHEMA_VERSION) {
      if (strict) throw new Error('Unsupported Journey Memory version');
      return EMPTY_STATE;
    }
    return {
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      sessions: parsed.sessions.map(migrateSessionToCurrentSchema).filter(validSession).slice(0, MAX_SESSIONS),
    };
  } catch (error) {
    if (strict) throw error;
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
    let stageStartMs = 0;
    const plannedRecognitionCues = timeline.stages.flatMap(stage => {
      const cues = stage.spatialEvents.flatMap(event => event.type === 'cue' && event.recognitionSpace
        ? [{ cueId: `${stage.id}/${event.id}`, scheduledPositionMs: stageStartMs + event.atMs }]
        : []);
      stageStartMs += stage.durationMs;
      return cues;
    });
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
      ...(plannedRecognitionCues.length ? { plannedRecognitionCues } : {}),
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
    const state = await loadJourneyMemory(storage, true);
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

export function attachNightPlanToJourneyMemory(
  sessionId: string,
  nightPlanId: string,
  storage: Storage = AsyncStorage,
): Promise<void> {
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage, true);
    if (!state.sessions.some(session => session.id === sessionId)) throw new Error('Journey Memory session is unavailable');
    const sessions = state.sessions.map(session => session.id === sessionId
      ? { ...session, nightPlanId }
      : session);
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ ...state, sessions }));
  });
}

function completedMemorySession(
  session: JourneyMemorySession,
  outcome: JourneyMemoryOutcome,
  positionMs: number,
  endedAt: number,
  message?: string,
): JourneyMemorySession {
  const event: JourneyMemoryEvent = {
    type: OUTCOME_EVENT_TYPE[outcome], at: endedAt, positionMs,
    ...(message ? { message } : {}),
  };
  return {
    ...session, endedAt, outcome, endReason: OUTCOME_END_REASON[outcome],
    completionStatus: completionStatusFor(session, outcome, positionMs),
    progress: completionProgress(session.plannedDurationMs, positionMs),
    actualDurationMs: Math.max(0, positionMs),
    elapsedWallTimeMs: Math.max(0, endedAt - session.startedAt),
    events: [...session.events, event].slice(-MAX_EVENTS_PER_SESSION),
  };
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
    const state = await loadJourneyMemory(storage, true);
    if (!state.sessions.some(session => session.id === sessionId)) throw new Error('Journey Memory session is unavailable');
    const endedAt = now();
    const sessions = state.sessions.map(session => {
      if (session.id !== sessionId || session.endedAt) return session;
      return completedMemorySession(session, outcome, positionMs, endedAt, message);
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
    .filter(session => session.completionStatus === 'completed'
      || session.completionStatus === 'completed_early'
      || session.outcome === 'completed'
      || session.outcome === 'recovered_interrupted'
      || session.outcome === 'user_stopped')
    .slice(0, sampleSize);
  if (!observed.length) return null;

  const completed = observed.filter(session => session.completionStatus === 'completed'
    || session.completionStatus === 'completed_early'
    || session.outcome === 'completed'
    || session.outcome === 'recovered_interrupted');
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
    && (session.startedAt + session.plannedDurationMs <= now
      || (session.completionStatus === 'completed_early' && (session.endedAt ?? Infinity) <= now))
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
    const normalizedAnswers = normalizeLucidSignalReflection(answers);
    const sessions = state.sessions.map(item => item.id === sessionId
      ? { ...item, morningReflection: { answers: normalizedAnswers, savedAt: now() } }
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

// ── Durable native checkpoint reconciliation ──────────────
//
// The native side persists a small checkpoint (position, fired-signal
// ledger, last-write time) to disk independently of this JS layer, so it
// survives the process being killed outright. This reconciles that
// checkpoint into a real outcome the next time the app launches, instead of
// leaving the session open forever with no explanation.

export type JourneyMemoryCheckpoint = Omit<NativeCheckpoint, 'pendingDiagnostics'> & {
  pendingDiagnostics?: NativeAudioDiagnosticEvent[];
};

/**
 * A process exit only explains an ended journey if it happened right after the last checkpoint
 * (written every two minutes while the service runs). Hours later it is an idle process being
 * cleaned up, not the reason the audio stopped.
 */
const PROCESS_EXIT_CAUSE_WINDOW_MS = 10 * 60_000;

export function findMatchingProcessExit(
  sessionStartedAt: number,
  checkpoint: JourneyMemoryCheckpoint,
  exits: NativeProcessExitInfo[],
  currentTime = Date.now(),
): NativeProcessExitInfo | undefined {
  return exits
    .filter(exit => exit.timestamp >= sessionStartedAt && exit.timestamp <= currentTime + 60_000)
    .filter(exit => exit.timestamp >= checkpoint.lastUpdatedAt - 60_000
      && exit.timestamp <= checkpoint.lastUpdatedAt + PROCESS_EXIT_CAUSE_WINDOW_MS)
    .filter(exit => checkpoint.processId == null || exit.processId === checkpoint.processId)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

/** Plain wording for the event recorded when a relaunch finds a journey that ended without a receipt. */
export function interruptedBeforeRelaunchLabel(event: Pick<JourneyMemoryEvent, 'reason'>): string {
  if (event.reason === 'route_loss_before_relaunch') return 'Ended when the headphones or speaker disconnected';
  if (event.reason === 'interruption_before_relaunch') return 'Ended by a system audio interruption';
  return 'Ended without a final receipt';
}

/**
 * Whether a recovered session should be filed as an unexpected termination. A night that ended
 * because the audio output disconnected or the system interrupted playback is a known cause, not
 * a crash or kill, unless Android also recorded a process exit right after the last checkpoint.
 */
export function shouldReportUnexpectedTermination(
  checkpoint: Pick<JourneyMemoryCheckpoint, 'terminalOutcome' | 'pauseReason'>,
  matchingExit?: NativeProcessExitInfo,
): boolean {
  if (checkpoint.terminalOutcome || checkpoint.pauseReason === 'user') return false;
  const knownAudioPause = checkpoint.pauseReason === 'route_loss' || checkpoint.pauseReason === 'interruption';
  return !knownAudioPause || Boolean(matchingExit);
}

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
  processExits: NativeProcessExitInfo[] = [],
): Promise<JourneyMemoryOutcome | null> {
  // One serialized write commits both native evidence and its outcome. A failed
  // write leaves the receipt unacknowledged and retries cannot duplicate events.
  return enqueue(async () => {
    const state = await loadJourneyMemory(storage, true);
    const session = state.sessions.find(item => item.id === checkpoint.sessionId);
    if (!session || session.endedAt) return null;

    // Recovery is deliberately strict: the last durable position must be within
    // 30 seconds of the end. A percentage threshold could misclassify many
    // missing minutes in a long overnight protocol.
    const nearPlannedEnd = checkpoint.positionMs >= session.plannedDurationMs - 30_000;
    const allSignalsFired = checkpoint.plannedCueIds != null && checkpoint.firedCueIds != null
      ? checkpoint.plannedCueIds.every(id => checkpoint.firedCueIds!.includes(id))
      : checkpoint.plannedSignalCount != null && checkpoint.firedSignalIds.length >= checkpoint.plannedSignalCount;
    const processExit = findMatchingProcessExit(session.startedAt, checkpoint, processExits, now());
    const processFailure = processExit && ['crash', 'crash_native', 'anr', 'initialization_failure'].includes(processExit.reason);
    const osTermination = processExit && ['low_memory', 'excessive_resource_usage', 'dependency_died', 'freezer'].includes(processExit.reason);
    const outcome: JourneyMemoryOutcome = checkpoint.terminalOutcome
      ?? (processFailure ? 'failed'
        : osTermination ? 'os_terminated'
          : nearPlannedEnd && allSignalsFired && checkpoint.pauseReason !== 'user' ? 'recovered_interrupted'
            : checkpoint.positionMs > 0 ? 'abandoned_interrupted' : 'unknown');

    const recoveredEvents: JourneyMemoryEvent[] = [];
    for (const event of checkpoint.pendingDiagnostics ?? []) {
      recoveredEvents.push({
        type: event.type,
        at: event.atMs,
        positionMs: checkpoint.positionMs,
        reason: event.reason,
        route: event.route,
        signalId: event.signalId,
        cueId: event.cueId,
        scheduledPositionMs: event.scheduledPositionMs,
        actualPositionMs: event.actualPositionMs,
        driftMs: event.driftMs,
        underrunCount: event.underrunCount,
      });
    }

    if (!checkpoint.terminalOutcome) recoveredEvents.push({
      at: now(),
      type: checkpoint.pauseReason === 'user' ? 'playback_paused' : 'previous_session_interrupted_unexpectedly',
      reason: checkpoint.pauseReason === 'user'
        ? 'user_pause_before_relaunch'
        : checkpoint.pauseReason === 'route_loss' ? 'route_loss_before_relaunch'
          : checkpoint.pauseReason === 'interruption' ? 'interruption_before_relaunch'
            : undefined,
      positionMs: checkpoint.positionMs,
      stageId: checkpoint.stageId,
      lastUpdatedAt: checkpoint.lastUpdatedAt,
      route: checkpoint.audioRoute,
      engineRunning: checkpoint.engineRunning,
      playbackState: checkpoint.playbackState,
      audioFocus: checkpoint.audioFocus,
      foregroundServiceState: checkpoint.engineRunning ? 'running' : 'stopped',
      desiredPlaying: checkpoint.desiredPlaying,
      pauseReason: checkpoint.pauseReason,
      lastStopReason: checkpoint.lastStopReason,
      processId: checkpoint.processId,
      processInstanceId: checkpoint.processInstanceId,
      exitReason: processExit?.reason,
      exitReasonCode: processExit?.reasonCode,
      exitDescription: processExit?.description,
      exitTimestamp: processExit?.timestamp,
      processImportance: processExit?.importance,
      processStatus: processExit?.status,
      pssKb: processExit?.pssKb,
      rssKb: processExit?.rssKb,
    });

    const staleSeconds = Math.max(0, Math.round((now() - checkpoint.lastUpdatedAt) / 1_000));
    const endedAt = checkpoint.terminalOutcome ? checkpoint.lastUpdatedAt : now();
    const message = `reconciled from checkpoint (last written ${staleSeconds}s before relaunch, ${checkpoint.firedSignalIds.length}${checkpoint.plannedSignalCount != null ? `/${checkpoint.plannedSignalCount}` : ''} signals fired${processExit ? `, Android exit: ${processExit.reason}` : ', no matching process exit evidence'})`;
    const { pendingDiagnostics: _pending, ...nativeCheckpoint } = checkpoint;
    const completed = completedMemorySession(
      { ...session, nativeCheckpoint, events: [...session.events, ...recoveredEvents] }, outcome, checkpoint.positionMs, endedAt, message,
    );
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({
      ...state, sessions: state.sessions.map(item => item.id === session.id ? completed : item),
    }));
    return outcome;
  });
}
