import { describe, expect, it } from '@jest/globals';
import { DEFAULT_PROCEDURAL_AUDIO_CONFIG } from '../audio/config';
import {
  findJourneyContinuation,
  isResumableJourneyCheckpoint,
  journeyContinuationTimeLabel,
  journeyForContinuation,
} from '../journeyContinuation';
import type { JourneyMemorySession } from '../journeyMemory';
import type { NativeCheckpoint } from '../audio/types';

const now = 10 * 60 * 60_000;
const session: JourneyMemorySession = {
  schemaVersion: 2,
  id: 'session-1',
  journeyId: 'overnight-recognition-ocean-standard',
  title: 'Overnight Recognition',
  startedAt: 1,
  plannedDurationMs: 120_000,
  endPolicy: 'protocolControlled',
  protocolVersion: 2,
  seed: 7,
  initialConfig: DEFAULT_PROCEDURAL_AUDIO_CONFIG,
  stages: [
    { id: 'preparation', durationMs: 60_000, config: DEFAULT_PROCEDURAL_AUDIO_CONFIG },
    { id: 'overnight-window', durationMs: 60_000, config: DEFAULT_PROCEDURAL_AUDIO_CONFIG },
  ],
  plannedRecognitionCues: [{ cueId: 'overnight-window/cue-1', scheduledPositionMs: 90_000 }],
  events: [{ type: 'started', at: 1, positionMs: 0 }],
};
const checkpoint: NativeCheckpoint = {
  sessionId: session.id,
  positionMs: 75_000,
  lastUpdatedAt: now - 1_000,
  firedSignalIds: [],
  pendingDiagnostics: [],
};

describe('journey continuation', () => {
  it('offers a recent incomplete Overnight Journey and reports its remaining time', () => {
    expect(isResumableJourneyCheckpoint(checkpoint, session, now)).toBe(true);
    expect(findJourneyContinuation({ schemaVersion: 2, sessions: [session] }, [checkpoint], now))
      .toMatchObject({ remainingMs: 45_000 });
    expect(journeyContinuationTimeLabel(45_000)).toBe('1 min remaining');
  });

  it('does not offer completed, expired, or non-overnight sessions', () => {
    expect(isResumableJourneyCheckpoint(checkpoint, { ...session, endedAt: now }, now)).toBe(false);
    expect(isResumableJourneyCheckpoint({ ...checkpoint, lastUpdatedAt: 0 }, session, now + 20 * 60 * 60_000)).toBe(false);
    expect(isResumableJourneyCheckpoint(checkpoint, { ...session, journeyId: 'lucid-signal' }, now)).toBe(false);
  });

  it('rebuilds preserved stages and recognition cue positions', () => {
    const journey = journeyForContinuation(session, null);
    expect(journey.timeline.seed).toBe(7);
    expect(journey.timeline.stages[1].spatialEvents).toEqual([
      expect.objectContaining({ id: 'cue-1', atMs: 30_000, recognitionSpace: true }),
    ]);
  });
});
