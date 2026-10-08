import { describe, expect, it } from '@jest/globals';
import {
  adaptiveRecipeSample,
  deriveSupportedEnvironmentAdjustment,
} from '../adaptiveRecipeLearning';
import type { NightRecord } from '../nightRecords';

function record(
  id: string,
  environment: 'ocean' | 'forest',
  recall: 'dream' | 'none',
  options: {
    signalId?: 'guardian' | 'chimes';
    interruptions?: number;
    delivered?: number;
    routeChanges?: number;
    durationMinutes?: number;
  } = {},
): NightRecord {
  const plannedCues = [{ cueId: 'cue-1' }, { cueId: 'cue-2' }];
  const delivered = options.delivered ?? 2;
  const durationMinutes = options.durationMinutes ?? 420;
  return {
    schemaVersion: 1,
    id,
    source: 'overnight_journey',
    sourceSessionId: id,
    scheduledAt: 1,
    sleepOnsetAt: 1,
    reviewAt: 2,
    reflectedAt: Number(id.replace(/\D/g, '')) || 1,
    outcome: { recall, sleepImpact: 'none' },
    practiceContext: {
      linkedAt: 3,
      links: [{
        sessionId: id,
        type: 'overnight_journey',
        startedAt: 1,
        linkReason: 'exact_overnight_session',
        environment,
        nightExecution: {
          status: 'completed',
          startedAt: 1,
          endedAt: 2,
          plannedCues,
          deliveredCues: plannedCues.slice(0, delivered).map(cue => ({ ...cue, firedAt: 2 })),
          missingCueIds: plannedCues.slice(delivered).map(cue => cue.cueId),
          audioRoute: 'private',
          audioRouteChanges: options.routeChanges ?? 0,
          outputVolume: { min: 0.5, max: 0.55 },
          interruptionCount: options.interruptions ?? 0,
        },
      }],
      nightPlan: {
        id: `plan-${id}`,
        createdAt: 1,
        source: 'manual',
        configuration: {
          durationMinutes,
          environment,
          feel: 'gentle',
          signalId: options.signalId ?? 'guardian',
          cuePlan: 'gentle',
          recognitionWindowCount: 2,
          signalGainScale: 1,
        },
        userChanged: [],
        recipe: {
          schemaVersion: 2,
          id: `recipe-${id}`,
          createdAt: 1,
          seed: 1,
          goal: 'lucid_recognition',
          durationMinutes,
          environment,
          feel: 'gentle',
          preparation: { practice: 'lucid_signal', durationMinutes: 7 },
          recognition: {
            signalId: options.signalId ?? 'guardian',
            cuePlan: 'gentle',
            windows: plannedCues.map((cue, index) => ({
              id: cue.cueId,
              cueAtMinute: 300 + index * 80,
              signalGainScale: 1,
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

describe('adaptive recipe learning', () => {
  it('finds an environment pattern only after enough otherwise-matched nights', () => {
    const records = [
      ...['1', '2', '3', '4'].map(id => record(id, 'ocean', 'dream')),
      record('5', 'ocean', 'none'),
      ...['6', '7', '8'].map(id => record(id, 'forest', 'none')),
    ];
    expect(deriveSupportedEnvironmentAdjustment(records)).toEqual({
      environment: 'ocean',
      recalledNights: 4,
      environmentNights: 5,
      comparisonRecallNights: 0,
      comparisonNights: 3,
      reason: 'You recalled dreams after 4 of 5 comparable Ocean nights, compared with 0 of 3 otherwise-matched nights.',
    });
  });

  it('excludes interrupted, incomplete, and route-changing nights', () => {
    expect(adaptiveRecipeSample(record('1', 'ocean', 'dream', { interruptions: 1 }))).toEqual(expect.objectContaining({
      eligibleForEnvironment: false,
      exclusion: 'interrupted',
    }));
    expect(adaptiveRecipeSample(record('2', 'ocean', 'dream', { delivered: 1 }))).toEqual(expect.objectContaining({
      eligibleForEnvironment: false,
      exclusion: 'missing_cues',
    }));
    expect(adaptiveRecipeSample(record('3', 'ocean', 'dream', { routeChanges: 1 }))).toEqual(expect.objectContaining({
      eligibleForEnvironment: false,
      exclusion: 'route_changed',
    }));
  });

  it('does not compare nights whose other recipe settings differ', () => {
    const records = [
      ...['1', '2', '3', '4', '5'].map(id => record(id, 'ocean', 'dream')),
      ...['6', '7', '8'].map(id => record(id, 'forest', 'none', { signalId: 'chimes' })),
    ];
    expect(deriveSupportedEnvironmentAdjustment(records)).toBeNull();
  });

  it('does not compare different night durations as the same recipe condition', () => {
    const records = [
      ...['1', '2', '3', '4', '5'].map(id => record(id, 'ocean', 'dream')),
      ...['6', '7', '8'].map(id => record(id, 'forest', 'none', { durationMinutes: 480 })),
    ];
    expect(deriveSupportedEnvironmentAdjustment(records)).toBeNull();
  });

  it('does not turn excluded nights into supporting evidence', () => {
    const records = [
      ...['1', '2', '3', '4'].map(id => record(id, 'ocean', 'dream')),
      record('5', 'ocean', 'dream', { interruptions: 1 }),
      ...['6', '7', '8'].map(id => record(id, 'forest', 'none')),
    ];
    expect(deriveSupportedEnvironmentAdjustment(records)).toBeNull();
  });
});
