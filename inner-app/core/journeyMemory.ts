import type { LucidSignalReflection } from './lucidSignalLearning';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CompiledAudioJourneyTimeline,
  NoiseColor,
  ProceduralAudioConfig,
  ProceduralEnvironment,
} from './audio';

export const JOURNEY_MEMORY_KEY = 'inner.journey-memory.v1';
export const JOURNEY_MEMORY_SCHEMA_VERSION = 1 as const;

const MAX_SESSIONS = 60;
const MAX_EVENTS_PER_SESSION = 240;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export type JourneyMemoryOutcome = 'completed' | 'left_early' | 'failed';
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
  | 'left_early'
  | 'error';

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
  endReason?: 'timeline_completed' | 'manual_stop' | 'playback_error';
  actualDurationMs?: number;
  elapsedWallTimeMs?: number;
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

export async function loadJourneyMemory(storage: Storage = AsyncStorage): Promise<JourneyMemoryState> {
  try {
    const raw = await storage.getItem(JOURNEY_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.schemaVersion !== JOURNEY_MEMORY_SCHEMA_VERSION || !Array.isArray(parsed.sessions)) {
      return EMPTY_STATE;
    }
    return {
      schemaVersion: JOURNEY_MEMORY_SCHEMA_VERSION,
      sessions: parsed.sessions.filter(validSession).slice(0, MAX_SESSIONS),
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
        type: outcome === 'completed' ? 'completed' : outcome === 'failed' ? 'error' : 'left_early',
        at: endedAt,
        positionMs,
        ...(message ? { message } : {}),
      };
      return {
        ...session,
        endedAt,
        outcome,
        endReason: outcome === 'completed'
          ? 'timeline_completed'
          : outcome === 'failed'
            ? 'playback_error'
            : 'manual_stop',
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
    .filter(session => !session.journeyId.startsWith('dev-test-'))
    .filter(session => session.outcome === 'completed' || session.outcome === 'left_early')
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
