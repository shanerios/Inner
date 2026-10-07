import { describe, expect, it } from '@jest/globals';
import { deriveCueLevelAdjustment, nightLearningSample } from '../nightLearning';
import type { NightRecord } from '../nightRecords';

function record(
  id: string,
  options: {
    gain?: number;
    noticed?: 'yes' | 'unsure' | 'no';
    sleepImpact?: 'none' | 'gentle' | 'woke';
    delivered?: number;
    planned?: number;
    interruptions?: number;
    status?: 'completed' | 'completed_early' | 'partial' | 'abandoned' | 'failed';
    testSession?: boolean;
    route?: 'private' | 'speaker' | 'unknown';
    quietNight?: boolean;
    volume?: { min: number; max: number };
    routeChanges?: number;
  } = {},
): NightRecord {
  const gain = options.gain ?? 1;
  const planned = options.planned ?? 2;
  const delivered = options.delivered ?? planned;
  const plannedCues = Array.from({ length: planned }, (_, index) => ({ cueId: `cue-${index + 1}` }));
  const deliveredCues = Array.from({ length: delivered }, (_, index) => ({
    cueId: `cue-${index + 1}`,
    firedAt: 100 + index,
  }));
  return {
    schemaVersion: 1,
    id,
    source: 'overnight_journey',
    sourceSessionId: id,
    scheduledAt: 1,
    sleepOnsetAt: 1,
    reviewAt: 2,
    reflectedAt: Number(id.replace(/\D/g, '')) || 1,
    testSession: options.testSession,
    outcome: {
      recall: 'none',
      signalNotice: options.noticed,
      sleepImpact: options.sleepImpact,
    },
    practiceContext: {
      linkedAt: 3,
      links: [{
        sessionId: id,
        type: 'overnight_journey',
        startedAt: 1,
        linkReason: 'exact_overnight_session',
        nightExecution: {
          status: options.status ?? 'completed',
          startedAt: 1,
          endedAt: 2,
          plannedCues,
          deliveredCues,
          missingCueIds: plannedCues.slice(delivered).map(cue => cue.cueId),
          audioRoute: options.route ?? 'private',
          ...(options.volume ? { outputVolume: options.volume } : {}),
          ...(options.routeChanges !== undefined ? { audioRouteChanges: options.routeChanges } : {}),
          interruptionCount: options.interruptions ?? 0,
        },
      }],
      nightPlan: {
        id: `plan-${id}`,
        createdAt: 1,
        source: 'manual',
        configuration: {
          durationMinutes: 420,
          environment: 'ocean',
          feel: 'gentle',
          signalId: 'guardian',
          cuePlan: 'gentle',
          recognitionWindowCount: planned,
          signalGainScale: gain,
        },
        userChanged: [],
        ...(options.quietNight ? { quietNight: true } : {}),
        recipe: {
          schemaVersion: 2,
          id: `recipe-${id}`,
          createdAt: 1,
          seed: 1,
          goal: 'lucid_recognition',
          durationMinutes: 420,
          environment: 'ocean',
          feel: 'gentle',
          preparation: { practice: 'lucid_signal', durationMinutes: 7 },
          recognition: {
            signalId: 'guardian',
            cuePlan: 'gentle',
            windows: plannedCues.map((cue, index) => ({
              id: cue.cueId,
              cueAtMinute: 300 + index * 80,
              signalGainScale: gain,
              presentations: 1,
              backgroundDuckGain: 0.55,
              recoverySeconds: 35,
            })),
          },
          environmentArc: 'protected_standard',
        },
      },
    },
  };
}

describe('night learning', () => {
  it('requires confirmed complete delivery before cue-level learning', () => {
    expect(nightLearningSample(record('1', { delivered: 1, planned: 2, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'missing_cues',
    }));
    expect(nightLearningSample(record('2', { interruptions: 1, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'interrupted',
    }));
    expect(nightLearningSample(record('3', { testSession: true, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'test_session',
    }));
  });

  it('excludes quiet nights from cue-level learning', () => {
    expect(nightLearningSample(record('1', { quietNight: true, sleepImpact: 'none', noticed: 'no' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'quiet_night',
    }));
    expect(nightLearningSample(record('2', { sleepImpact: 'none', noticed: 'no' })).eligibleForCueLevel).toBe(true);
  });

  it('does not raise the signal from quiet nights that went unnoticed', () => {
    expect(deriveCueLevelAdjustment([
      record('1', { quietNight: true, sleepImpact: 'none', noticed: 'no' }),
      record('2', { quietNight: true, sleepImpact: 'none', noticed: 'no' }),
      record('3', { quietNight: true, sleepImpact: 'none', noticed: 'no' }),
    ])).toBeNull();
  });

  it('ignores quiet nights when counting comparable nights', () => {
    expect(deriveCueLevelAdjustment([
      record('1', { sleepImpact: 'none', noticed: 'no' }),
      record('2', { sleepImpact: 'none', noticed: 'no' }),
      record('3', { quietNight: true, sleepImpact: 'none', noticed: 'no' }),
    ])).toBeNull();
  });

  it('excludes nights played near mute or at a changing volume', () => {
    expect(nightLearningSample(record('1', { volume: { min: 0.1, max: 0.1 }, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'volume_low',
    }));
    expect(nightLearningSample(record('2', { volume: { min: 0.4, max: 0.7 }, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'volume_changed',
    }));
    expect(nightLearningSample(record('3', { volume: { min: 0.5, max: 0.55 }, sleepImpact: 'none' })).eligibleForCueLevel).toBe(true);
  });

  it('excludes nights whose audio route changed, and keeps unrecorded or steady ones', () => {
    expect(nightLearningSample(record('1', { routeChanges: 1, sleepImpact: 'none' }))).toEqual(expect.objectContaining({
      eligibleForCueLevel: false,
      exclusion: 'route_changed',
    }));
    expect(nightLearningSample(record('2', { routeChanges: 0, sleepImpact: 'none' })).eligibleForCueLevel).toBe(true);
    expect(nightLearningSample(record('3', { sleepImpact: 'none' })).eligibleForCueLevel).toBe(true);
  });

  it('keeps nights without a recorded volume eligible', () => {
    expect(nightLearningSample(record('1', { sleepImpact: 'none' })).eligibleForCueLevel).toBe(true);
  });

  it('only compares nights heard at a similar volume', () => {
    expect(deriveCueLevelAdjustment([
      record('1', { volume: { min: 0.5, max: 0.5 }, sleepImpact: 'none', noticed: 'no' }),
      record('2', { volume: { min: 0.2, max: 0.2 }, sleepImpact: 'none', noticed: 'no' }),
      record('3', { volume: { min: 0.5, max: 0.5 }, sleepImpact: 'none', noticed: 'no' }),
    ])).toBeNull();
    expect(deriveCueLevelAdjustment([
      record('1', { volume: { min: 0.5, max: 0.5 }, sleepImpact: 'none', noticed: 'no' }),
      record('2', { volume: { min: 0.55, max: 0.55 }, sleepImpact: 'none', noticed: 'no' }),
      record('3', { volume: { min: 0.5, max: 0.5 }, sleepImpact: 'none', noticed: 'no' }),
    ])).toEqual(expect.objectContaining({ direction: 'raise' }));
  });

  it('lowers the signal one conservative step after repeated confirmed waking', () => {
    const adjustment = deriveCueLevelAdjustment([
      record('1', { sleepImpact: 'woke', noticed: 'yes' }),
      record('2', { sleepImpact: 'woke', noticed: 'yes' }),
      record('3', { sleepImpact: 'gentle', noticed: 'yes' }),
    ]);
    expect(adjustment).toEqual(expect.objectContaining({
      direction: 'lower',
      previousGainScale: 1,
      proposedGainScale: 0.85,
      sampleCount: 3,
      wokeCount: 2,
    }));
  });

  it('raises the signal only after repeated non-recognition without waking', () => {
    const adjustment = deriveCueLevelAdjustment([
      record('1', { sleepImpact: 'none', noticed: 'no' }),
      record('2', { sleepImpact: 'none', noticed: 'no' }),
      record('3', { sleepImpact: 'gentle', noticed: 'no' }),
    ]);
    expect(adjustment).toEqual(expect.objectContaining({
      direction: 'raise',
      previousGainScale: 1,
      proposedGainScale: 1.1,
      notNoticedCount: 3,
    }));
  });

  it('does not change level from not waking alone or mix audio routes', () => {
    expect(deriveCueLevelAdjustment([
      record('1', { sleepImpact: 'none', noticed: 'unsure' }),
      record('2', { sleepImpact: 'none', noticed: 'yes' }),
      record('3', { sleepImpact: 'none', noticed: 'no' }),
    ])).toBeNull();
    expect(deriveCueLevelAdjustment([
      record('1', { sleepImpact: 'woke', noticed: 'yes', route: 'private' }),
      record('2', { sleepImpact: 'woke', noticed: 'yes', route: 'private' }),
      record('3', { sleepImpact: 'woke', noticed: 'yes', route: 'speaker' }),
    ])).toBeNull();
  });

  it('waits for three nights at a newly proposed level before stepping again', () => {
    expect(deriveCueLevelAdjustment([
      record('1', { gain: 1, sleepImpact: 'woke', noticed: 'yes' }),
      record('2', { gain: 1, sleepImpact: 'woke', noticed: 'yes' }),
      record('3', { gain: 1, sleepImpact: 'woke', noticed: 'yes' }),
      record('4', { gain: 0.85, sleepImpact: 'woke', noticed: 'yes' }),
    ])).toBeNull();
  });
});
