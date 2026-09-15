import {
  pendingOvernightReflection,
  saveOvernightReflection,
  saveOvernightMorningCapture,
  beginJourneyMemorySession,
  deriveJourneyMemoryProfile,
  createMorningReturnTestSession,
  finishJourneyMemorySession,
  JOURNEY_MEMORY_KEY,
  loadJourneyMemory,
  recordJourneyMemoryEvent,
  reconcileInterruptedJourneyMemorySession,
} from '../journeyMemory';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../audio';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    values,
  };
}

const timeline = {
  id: 'test-timeline',
  title: 'Test Journey',
  seed: 42,
  loop: false,
  fadeInMs: 4_000,
  endPolicy: 'fadeAndStop' as const,
  protocolVersion: 1,
  totalDurationMs: 60_000,
  stages: [{
    id: 'arrival',
    label: 'Arrival',
    durationMs: 60_000,
    transitionMs: 4_000,
    config: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
    spatialEvents: [],
  }],
};

describe('journey memory', () => {
  it('records a versioned session, events, and completion', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    await recordJourneyMemoryEvent(
      session.id, { type: 'stage_changed', positionMs: 1_000, stageId: 'arrival' }, storage as any, () => 200,
    );
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage as any, () => 300);

    const state = await loadJourneyMemory(storage as any);
    expect(state.schemaVersion).toBe(2);
    expect(state.sessions[0]).toMatchObject({
      journeyId: 'test-journey',
      outcome: 'completed',
      endPolicy: 'fadeAndStop',
      endReason: 'timeline_completed',
      completionStatus: 'completed',
      progress: 1,
      actualDurationMs: 60_000,
      elapsedWallTimeMs: 200,
      endedAt: 300,
    });
    expect(state.sessions[0].events.map(event => event.type)).toEqual([
      'started', 'stage_changed', 'completed',
    ]);
    expect(storage.values.has(JOURNEY_MEMORY_KEY)).toBe(true);
  });

  it('does not overwrite the first terminal outcome', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage as any, () => 200);
    await finishJourneyMemorySession(session.id, 'user_stopped', 10_000, undefined, storage as any, () => 300);
    expect((await loadJourneyMemory(storage as any)).sessions[0].outcome).toBe('completed');
  });

  it('derives explainable preferences only from completed listening', () => {
    const completedSession = (id: string, journeyId: string, durationMs: number) => ({
      schemaVersion: 2 as const,
      id,
      journeyId,
      title: journeyId,
      startedAt: 100,
      endedAt: 200,
      plannedDurationMs: durationMs,
      endPolicy: 'fadeAndStop' as const,
      protocolVersion: 1,
      seed: 42,
      initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      stages: [{
        id: 'settle',
        durationMs,
        config: {
          ...DEFAULT_PROCEDURAL_AUDIO_CONFIG,
          environment: 'ocean' as const,
          environmentGain: 0.3,
          noiseColor: 'pink' as const,
          noiseGain: 0.2,
        },
      }],
      outcome: 'completed' as const,
      events: [{ type: 'started' as const, at: 100, positionMs: 0 }],
    });
    const sessions = [
      completedSession('three', 'lucid-return', 10 * 60_000),
      completedSession('two', 'lucid-return', 8 * 60_000),
      completedSession('one', 'lucid-threshold', 25 * 60_000),
    ];
    sessions[0].events.push({ type: 'seeked', at: 150, positionMs: 20_000 } as any);

    expect(deriveJourneyMemoryProfile({ schemaVersion: 2, sessions })).toEqual({
      sessionsObserved: 3,
      completedSessions: 3,
      completionRate: 1,
      typicalCompletedDurationMs: 10 * 60_000,
      mostRepeatedJourneyId: 'lucid-return',
      preferredEnvironment: 'ocean',
      preferredNoiseColor: 'pink',
      seekRate: 1 / 3,
      confidence: 'early',
    });
  });

  it('does not treat failed sessions as a listening preference', () => {
    const failed = {
      schemaVersion: 2 as const,
      id: 'failed',
      journeyId: 'broken',
      title: 'Broken',
      startedAt: 100,
      endedAt: 101,
      plannedDurationMs: 60_000,
      endPolicy: 'fadeAndStop' as const,
      protocolVersion: 1,
      seed: 1,
      initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      stages: [],
      outcome: 'failed' as const,
      events: [{ type: 'error' as const, at: 101, positionMs: 0 }],
    };
    const profile = deriveJourneyMemoryProfile({ schemaVersion: 2, sessions: [failed] });
    expect(profile).toBeNull();
  });

  it('never treats accelerated development sessions as listener preference evidence', () => {
    const developmentSession = {
      schemaVersion: 2 as const,
      id: 'dev-session',
      journeyId: 'dev-test-overnight-recognition-ocean-standard',
      title: 'Accelerated Night',
      startedAt: 100,
      endedAt: 200,
      plannedDurationMs: 8 * 60_000,
      endPolicy: 'protocolControlled' as const,
      protocolVersion: 1,
      seed: 1,
      initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      stages: [],
      outcome: 'completed' as const,
      events: [{ type: 'completed' as const, at: 200, positionMs: 8 * 60_000 }],
    };
    expect(deriveJourneyMemoryProfile({ schemaVersion: 2, sessions: [developmentSession] })).toBeNull();
  });
});


describe('overnight reflection linkage', () => {
  const answers = { noticed: 'yes' as const, lucid: false, sleepImpact: 'none' as const };
  const overnight = { ...timeline, endPolicy: 'protocolControlled' as const };

  it('preserves a manual stop while classifying a substantially complete night as completed early', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession('overnight-recognition-ocean-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await finishJourneyMemorySession(session.id, 'user_stopped', 51_000, undefined, storage, () => 200);

    const saved = await loadJourneyMemory(storage);
    expect(saved.sessions[0]).toMatchObject({
      outcome: 'user_stopped',
      endReason: 'manual_stop',
      completionStatus: 'completed_early',
      progress: 0.85,
    });
    expect(pendingOvernightReflection(saved, 200)?.id).toBe(session.id);
    expect(deriveJourneyMemoryProfile(saved)?.completedSessions).toBe(1);
  });

  it('keeps an earlier manual overnight stop partial', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession('overnight-recognition-ocean-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await finishJourneyMemorySession(session.id, 'user_stopped', 48_000, undefined, storage, () => 200);

    const saved = await loadJourneyMemory(storage);
    expect(saved.sessions[0]).toMatchObject({
      outcome: 'user_stopped',
      endReason: 'manual_stop',
      completionStatus: 'partial',
      progress: 0.8,
    });
    expect(pendingOvernightReflection(saved, 200)).toBeNull();
  });

  it('recovers an unreflected night after reload without inventing completion', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession('overnight-recognition-ocean-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    const reloaded = await loadJourneyMemory(storage);
    expect(pendingOvernightReflection(reloaded, 60_099)).toBeNull();
    expect(pendingOvernightReflection(reloaded, 60_100)?.id).toBe(session.id);
    await saveOvernightReflection(session.id, answers, storage, () => 60_100);
    const saved = await loadJourneyMemory(storage);
    expect(saved.sessions[0].morningReflection?.answers).toEqual(answers);
    expect(saved.sessions[0].outcome).toBeUndefined();
    expect(pendingOvernightReflection(saved, 60_100)).toBeNull();
  });

  it('saves to the selected session even after another night starts and a completion arrives', async () => {
    const storage = memoryStorage();
    const first = await beginJourneyMemorySession('overnight-recognition-ocean-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    const second = await beginJourneyMemorySession('overnight-recognition-ocean-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 70_000);
    await Promise.all([
      saveOvernightReflection(first.id, answers, storage, () => 80_000),
      finishJourneyMemorySession(first.id, 'completed', 60_000, undefined, storage, () => 80_001),
    ]);
    const saved = await loadJourneyMemory(storage);
    expect(saved.sessions.find(s => s.id === first.id)).toMatchObject({ outcome: 'completed', morningReflection: { answers } });
    expect(saved.sessions.find(s => s.id === second.id)?.morningReflection).toBeUndefined();
  });

  it('links a morning journal capture to the exact overnight session', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession('overnight-recognition-forest-standard', overnight,
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);

    await saveOvernightMorningCapture(session.id, 'journal-entry-1', storage, () => 60_100);

    const saved = await loadJourneyMemory(storage);
    expect(saved.sessions[0].morningCapture).toEqual({ journalEntryId: 'journal-entry-1', savedAt: 60_100 });
    expect(pendingOvernightReflection(saved, 60_100)?.id).toBe(session.id);
  });

  it('creates a completed Morning Return QA session that is excluded from preferences', async () => {
    const storage = memoryStorage();
    const session = await createMorningReturnTestSession(
      DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      storage,
      () => 70_000,
    );
    const saved = await loadJourneyMemory(storage);
    expect(session).toMatchObject({
      journeyId: 'overnight-recognition-forest-qa',
      outcome: 'completed',
      testSession: true,
    });
    expect(pendingOvernightReflection(saved, 70_000)?.id).toBe(session.id);
    expect(deriveJourneyMemoryProfile(saved)).toBeNull();
    await saveOvernightReflection(session.id, answers, storage, () => 70_001);
    expect((await loadJourneyMemory(storage)).sessions[0].morningReflection?.answers).toEqual(answers);
  });

  it('rejects missing, premature, failed, and development sessions', async () => {
    const storage = memoryStorage();
    await expect(saveOvernightReflection('missing', answers, storage)).rejects.toThrow();
    for (const id of ['overnight-recognition-ocean-standard', 'dev-test-overnight-recognition-ocean-standard']) {
      const session = await beginJourneyMemorySession(id, overnight, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
      await expect(saveOvernightReflection(session.id, answers, storage, () => 101)).rejects.toThrow();
      if (!id.startsWith('dev-test-')) await finishJourneyMemorySession(session.id, 'failed', 0, undefined, storage);
      await expect(saveOvernightReflection(session.id, answers, storage, () => 80_000)).rejects.toThrow();
    }
  });
});

describe('v1 schema migration', () => {
  it('upgrades a stored left_early outcome and event to the current taxonomy', async () => {
    const storage = memoryStorage();
    const v1Session = {
      schemaVersion: 1,
      id: 'legacy-session',
      journeyId: 'test-journey',
      title: 'Legacy',
      startedAt: 100,
      endedAt: 200,
      plannedDurationMs: 60_000,
      endPolicy: 'fadeAndStop',
      protocolVersion: 1,
      seed: 1,
      initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
      stages: [],
      outcome: 'left_early',
      events: [
        { type: 'started', at: 100, positionMs: 0 },
        { type: 'left_early', at: 200, positionMs: 10_000 },
      ],
    };
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ schemaVersion: 1, sessions: [v1Session] }));

    const loaded = await loadJourneyMemory(storage as any);
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.sessions[0].schemaVersion).toBe(2);
    expect(loaded.sessions[0].outcome).toBe('user_stopped');
    expect(loaded.sessions[0].events.map(event => event.type)).toEqual(['started', 'user_stopped']);
  });

  it('discards a schema version newer than what this build understands', async () => {
    const storage = memoryStorage();
    await storage.setItem(JOURNEY_MEMORY_KEY, JSON.stringify({ schemaVersion: 99, sessions: [{ id: 'future' }] }));
    const loaded = await loadJourneyMemory(storage as any);
    expect(loaded.sessions).toEqual([]);
  });
});

describe('checkpoint reconciliation', () => {
  it('marks a session near its planned end with all signals fired as recovered', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 59_000,
      lastUpdatedAt: 500,
      firedSignalIds: ['a', 'b'],
      plannedSignalCount: 2,
    }, storage as any, () => 600);

    expect(outcome).toBe('recovered_interrupted');
    const saved = await loadJourneyMemory(storage as any);
    expect(saved.sessions[0]).toMatchObject({
      outcome: 'recovered_interrupted',
      endReason: 'recovered',
      actualDurationMs: 59_000,
    });
  });

  it('does not infer recovery from a percentage that leaves minutes unplayed', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', { ...timeline, totalDurationMs: 7 * 60 * 60_000, stages: [{ ...timeline.stages[0], durationMs: 7 * 60 * 60_000 }] },
      DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 7 * 60 * 60_000 * 0.95,
      lastUpdatedAt: 500,
      firedSignalIds: ['a', 'b'],
      plannedSignalCount: 2,
    }, storage as any, () => 600);
    expect(outcome).toBe('abandoned_interrupted');
  });

  it('requires an explicit planned signal count before inferring recovery', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 59_000,
      lastUpdatedAt: 500,
      firedSignalIds: [],
    }, storage as any, () => 600);
    expect(outcome).toBe('abandoned_interrupted');
  });

  it('marks a genuinely mid-flight session as abandoned', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 15_000,
      lastUpdatedAt: 500,
      firedSignalIds: [],
      plannedSignalCount: 2,
    }, storage as any, () => 600);

    expect(outcome).toBe('abandoned_interrupted');
    expect((await loadJourneyMemory(storage as any)).sessions[0].outcome).toBe('abandoned_interrupted');
  });

  it('falls back to unknown when there is no meaningful position to reason from', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 0,
      lastUpdatedAt: 500,
      firedSignalIds: [],
    }, storage as any, () => 600);

    expect(outcome).toBe('unknown');
  });

  it('only reconciles a session that is truly still open', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage as any, () => 200);

    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 15_000,
      lastUpdatedAt: 500,
      firedSignalIds: [],
    }, storage as any, () => 600);

    expect(outcome).toBeNull();
    expect((await loadJourneyMemory(storage as any)).sessions[0].outcome).toBe('completed');
  });

  it('returns null for a checkpoint whose session no longer exists', async () => {
    const storage = memoryStorage();
    const outcome = await reconcileInterruptedJourneyMemorySession({
      sessionId: 'never-existed',
      positionMs: 15_000,
      lastUpdatedAt: 500,
      firedSignalIds: [],
    }, storage as any, () => 600);
    expect(outcome).toBeNull();
  });

  it('folds pending native diagnostics into the event trail ahead of the outcome event', async () => {
    const storage = memoryStorage();
    const session = await beginJourneyMemorySession(
      'test-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage as any, () => 100,
    );
    await reconcileInterruptedJourneyMemorySession({
      sessionId: session.id,
      positionMs: 15_000,
      lastUpdatedAt: 500,
      firedSignalIds: [],
      pendingDiagnostics: [
        { type: 'interruption_began', atMs: 300, reason: 'focus_loss' },
        { type: 'audio_underrun', atMs: 400, underrunCount: 3 },
      ],
    }, storage as any, () => 600);

    const events = (await loadJourneyMemory(storage as any)).sessions[0].events;
    expect(events).toMatchObject([
      { type: 'started' },
      { type: 'interruption_began', at: 300, reason: 'focus_loss' },
      { type: 'audio_underrun', at: 400, underrunCount: 3 },
      { type: 'abandoned_interrupted' },
    ]);
  });
});
