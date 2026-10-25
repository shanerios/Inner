import { beginJourneyMemorySession, finishJourneyMemorySession, recordJourneyMemoryEvent, reconcileInterruptedJourneyMemorySession, preserveJourneyContinuationEvidence } from '../journeyMemory';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../audio';
import { resetAnalyticsForTests, setAnalyticsClient } from '../analytics';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

const timeline = {
  id: 't', title: 'Private Night Title', seed: 1, loop: false, fadeInMs: 0, endPolicy: 'fadeAndStop' as const,
  protocolVersion: 1, totalDurationMs: 60_000,
  stages: [{ id: 'a', label: 'A', durationMs: 60_000, transitionMs: 0, config: DEFAULT_PROCEDURAL_AUDIO_CONFIG, spatialEvents: [] }],
};

const captured: Array<[string, any]> = [];
const names = () => captured.map(([name]) => name);

beforeEach(() => {
  captured.length = 0;
  resetAnalyticsForTests();
  setAnalyticsClient({ capture: (event, props) => { captured.push([event, props]); } });
});

describe('overnight lifecycle analytics', () => {
  it('labels the mode on lifecycle events and sends nothing else about it', async () => {
    const storage = memoryStorage() as any;
    const only = await beginJourneyMemorySession('overnight-recognition-only-standard', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await finishJourneyMemorySession(only.id, 'completed', 60_000, undefined, storage, () => 200);
    const full = await beginJourneyMemorySession('overnight-recognition-ocean-standard', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 300);
    await finishJourneyMemorySession(full.id, 'completed', 60_000, undefined, storage, () => 400);
    const modeOf = (sessionId: string) => captured.filter(([, props]) => props.session_id === sessionId).map(([, props]) => props.mode);
    expect(modeOf(only.id)).toEqual(['recognition_only', 'recognition_only']);
    expect(modeOf(full.id)).toEqual(['full', 'full']);
    expect(JSON.stringify(captured)).not.toContain('Private Night Title');
  });

  it('reports start and completion once each, with the same session id and no titles', async () => {
    const storage = memoryStorage() as any;
    const session = await beginJourneyMemorySession('overnight-recognition-x', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage, () => 200);
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage, () => 300);
    expect(names()).toEqual(['overnight_started', 'overnight_completed']);
    expect(captured[0][1].session_id).toBe(session.id);
    expect(captured[1][1].session_id).toBe(session.id);
    expect(JSON.stringify(captured)).not.toContain('Private Night Title');
  });

  it('ignores non-overnight journeys', async () => {
    const storage = memoryStorage() as any;
    const session = await beginJourneyMemorySession('lucid-journey', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await finishJourneyMemorySession(session.id, 'completed', 60_000, undefined, storage, () => 200);
    expect(names()).toEqual([]);
  });

  it('maps deliberate end, recovery and resume', async () => {
    const storage = memoryStorage() as any;
    const a = await beginJourneyMemorySession('overnight-recognition-x', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await recordJourneyMemoryEvent(a.id, { type: 'playback_resumed', positionMs: 5_000, reason: 'continued_live_checkpoint' }, storage, () => 150);
    await finishJourneyMemorySession(a.id, 'user_stopped', 10_000, undefined, storage, () => 200);
    expect(names()).toEqual(['overnight_started', 'overnight_resumed', 'overnight_ended_by_user']);

    captured.length = 0;
    const b = await beginJourneyMemorySession('overnight-recognition-x', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await reconcileInterruptedJourneyMemorySession({
      sessionId: b.id, positionMs: 59_000, lastUpdatedAt: 500, firedSignalIds: ['a'], plannedSignalCount: 1,
    } as any, storage, () => 600);
    expect(names()).toEqual(['overnight_started', 'overnight_recovered']);
  });

  it('reports an interruption once even if it is later reconciled as abandoned', async () => {
    const storage = memoryStorage() as any;
    const s = await beginJourneyMemorySession('overnight-recognition-x', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    const checkpoint: any = { sessionId: s.id, positionMs: 1_000, lastUpdatedAt: 500, firedSignalIds: [], plannedSignalCount: 1 };
    await preserveJourneyContinuationEvidence(checkpoint, storage, () => 600, []);
    await reconcileInterruptedJourneyMemorySession(checkpoint, storage, () => 700);
    expect(names().filter(name => name === 'overnight_interrupted')).toHaveLength(1);
  });

  it('never breaks session persistence when analytics throws', async () => {
    setAnalyticsClient({ capture: () => { throw new Error('down'); } });
    const storage = memoryStorage() as any;
    const s = await beginJourneyMemorySession('overnight-recognition-x', timeline, DEFAULT_PROCEDURAL_AUDIO_CONFIG, storage, () => 100);
    await expect(finishJourneyMemorySession(s.id, 'completed', 60_000, undefined, storage, () => 200)).resolves.toBeUndefined();
  });
});
