import {
  pendingOvernightReflection,
  saveOvernightReflection,
  saveOvernightMorningCapture,
  beginJourneyMemorySession,
  deriveJourneyMemoryProfile,
  finishJourneyMemorySession,
  JOURNEY_MEMORY_KEY,
  loadJourneyMemory,
  recordJourneyMemoryEvent,
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
    expect(state.schemaVersion).toBe(1);
    expect(state.sessions[0]).toMatchObject({
      journeyId: 'test-journey',
      outcome: 'completed',
      endPolicy: 'fadeAndStop',
      endReason: 'timeline_completed',
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
    await finishJourneyMemorySession(session.id, 'left_early', 10_000, undefined, storage as any, () => 300);
    expect((await loadJourneyMemory(storage as any)).sessions[0].outcome).toBe('completed');
  });

  it('derives explainable preferences only from completed listening', () => {
    const completedSession = (id: string, journeyId: string, durationMs: number) => ({
      schemaVersion: 1 as const,
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

    expect(deriveJourneyMemoryProfile({ schemaVersion: 1, sessions })).toEqual({
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
      schemaVersion: 1 as const,
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
    const profile = deriveJourneyMemoryProfile({ schemaVersion: 1, sessions: [failed] });
    expect(profile).toBeNull();
  });

  it('never treats accelerated development sessions as listener preference evidence', () => {
    const developmentSession = {
      schemaVersion: 1 as const,
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
    expect(deriveJourneyMemoryProfile({ schemaVersion: 1, sessions: [developmentSession] })).toBeNull();
  });
});


describe('overnight reflection linkage', () => {
  const answers = { noticed: 'yes' as const, lucid: false, sleepImpact: 'none' as const };
  const overnight = { ...timeline, endPolicy: 'protocolControlled' as const };

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
