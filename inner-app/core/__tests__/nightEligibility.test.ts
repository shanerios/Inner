import { describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  MAX_VOLUME_SPREAD,
  MIN_OUTPUT_VOLUME,
  NIGHT_EXCLUSION_LABELS,
  meanOutputVolume,
  nightEligibilityExclusion,
  nightExecutionFor,
  sameVolumeBand,
} from '../nightEligibility';
import { adaptiveRecipeSample } from '../adaptiveRecipeLearning';
import { nightLearningSample } from '../nightLearning';
import type { NightRecord } from '../nightRecords';

type Options = {
  status?: 'completed' | 'completed_early' | 'partial';
  planned?: number;
  delivered?: number;
  interruptions?: number;
  routeChanges?: number;
  volume?: { min: number; max: number };
  quietNight?: boolean;
  testSession?: boolean;
  source?: NightRecord['source'];
  withRecipe?: boolean;
  withExecution?: boolean;
};

function night(options: Options = {}): NightRecord {
  const planned = options.planned ?? 2;
  const delivered = options.delivered ?? planned;
  const cues = Array.from({ length: planned }, (_, index) => ({ cueId: `cue-${index + 1}` }));
  const window = (cueId: string, index: number) => ({
    id: cueId, cueAtMinute: 300 + index * 80, signalGainScale: 1, presentations: 1, backgroundDuckGain: 0.55, recoverySeconds: 35,
  });
  return {
    schemaVersion: 1,
    id: 'night-1',
    source: options.source ?? 'overnight_journey',
    sourceSessionId: 'night-1',
    scheduledAt: 1,
    sleepOnsetAt: 1,
    reviewAt: 2,
    reflectedAt: 3,
    testSession: options.testSession,
    outcome: { recall: 'clear', signalNotice: 'no', sleepImpact: 'none' },
    practiceContext: {
      linkedAt: 3,
      links: options.withExecution === false ? [] : [{
        sessionId: 'night-1',
        type: 'overnight_journey',
        startedAt: 1,
        linkReason: 'exact_overnight_session',
        nightExecution: {
          status: options.status ?? 'completed',
          startedAt: 1,
          endedAt: 2,
          plannedCues: cues,
          deliveredCues: cues.slice(0, delivered).map((cue, index) => ({ ...cue, firedAt: 100 + index })),
          missingCueIds: cues.slice(delivered).map(cue => cue.cueId),
          audioRoute: 'private',
          interruptionCount: options.interruptions ?? 0,
          ...(options.routeChanges !== undefined ? { audioRouteChanges: options.routeChanges } : {}),
          ...(options.volume ? { outputVolume: options.volume } : {}),
        },
      }],
      nightPlan: {
        id: 'plan-1', createdAt: 1, source: 'manual',
        configuration: {
          durationMinutes: 420, environment: 'ocean', feel: 'gentle', signalId: 'guardian', cuePlan: 'gentle',
          recognitionWindowCount: planned, signalGainScale: 1,
        },
        userChanged: [],
        ...(options.quietNight ? { quietNight: true } : {}),
        ...(options.withRecipe === false ? {} : {
          recipe: {
            schemaVersion: 2, id: 'r', createdAt: 1, seed: 1, goal: 'lucid_recognition', durationMinutes: 420,
            environment: 'ocean', feel: 'gentle', preparation: { practice: 'lucid_signal', durationMinutes: 7 },
            recognition: { signalId: 'guardian', cuePlan: 'gentle', windows: cues.map((cue, index) => window(cue.cueId, index)) },
            environmentArc: 'protected_standard',
          },
        }),
      },
    },
  } as unknown as NightRecord;
}

const CASES: Array<[string, Options]> = [
  ['test_session', { testSession: true }],
  ['not_overnight', { source: 'scheduled_signal' }],
  ['quiet_night', { quietNight: true }],
  ['missing_recipe', { withRecipe: false }],
  ['missing_execution', { withExecution: false }],
  ['incomplete_execution', { status: 'partial' }],
  ['missing_cues', { delivered: 1 }],
  ['interrupted', { interruptions: 1 }],
  ['route_changed', { routeChanges: 1 }],
  ['volume_low', { volume: { min: 0.1, max: 0.1 } }],
  ['volume_changed', { volume: { min: 0.4, max: 0.7 } }],
];

describe('shared night eligibility', () => {
  it('accepts a complete, steady, uninterrupted night', () => {
    const record = night({ volume: { min: 0.5, max: 0.55 }, routeChanges: 0 });
    expect(nightEligibilityExclusion(record, nightExecutionFor(record), true)).toBeUndefined();
  });

  it.each(CASES)('reports %s', (reason, options) => {
    const record = night(options);
    expect(nightEligibilityExclusion(record, nightExecutionFor(record), options.withRecipe !== false)).toBe(reason);
  });

  it('treats a difference of exactly the allowed spread as within it', () => {
    const record = night({ volume: { min: 0.5, max: 0.5 + MAX_VOLUME_SPREAD } });
    expect(nightEligibilityExclusion(record, nightExecutionFor(record), true)).toBeUndefined();
    const floor = night({ volume: { min: MIN_OUTPUT_VOLUME, max: MIN_OUTPUT_VOLUME } });
    expect(nightEligibilityExclusion(floor, nightExecutionFor(floor), true)).toBeUndefined();
  });

  it('keeps unrecorded volume and route eligible', () => {
    const record = night();
    expect(nightEligibilityExclusion(record, nightExecutionFor(record), true)).toBeUndefined();
  });

  it('reports a delivery problem before the listening conditions', () => {
    const record = night({ delivered: 1, routeChanges: 1, volume: { min: 0.05, max: 0.05 } });
    expect(nightEligibilityExclusion(record, nightExecutionFor(record), true)).toBe('missing_cues');
  });

  it('has a label for every reason either learner can report', () => {
    for (const [reason] of CASES) expect(NIGHT_EXCLUSION_LABELS[reason as keyof typeof NIGHT_EXCLUSION_LABELS]).toBeTruthy();
    for (const reason of ['missing_sleep_answer', 'signal_level_overridden', 'missing_recall_answer'] as const) {
      expect(NIGHT_EXCLUSION_LABELS[reason]).toBeTruthy();
    }
  });

  it('summarises volume the same way for everyone', () => {
    expect(meanOutputVolume(nightExecutionFor(night({ volume: { min: 0.4, max: 0.6 } })))).toBe(0.5);
    expect(meanOutputVolume(nightExecutionFor(night()))).toBeUndefined();
    expect(sameVolumeBand(0.5, 0.5 + MAX_VOLUME_SPREAD)).toBe(true);
    expect(sameVolumeBand(0.5, 0.5 + MAX_VOLUME_SPREAD + 0.05)).toBe(false);
    expect(sameVolumeBand(undefined, undefined)).toBe(true);
    expect(sameVolumeBand(0.5, undefined)).toBe(false);
  });

  it.each(CASES)('both learners agree on %s', (reason, options) => {
    const record = night(options);
    expect(nightLearningSample(record).exclusion).toBe(reason);
    expect(adaptiveRecipeSample(record).exclusion).toBe(reason);
  });

  it('both learners accept the same steady night', () => {
    const record = night({ volume: { min: 0.5, max: 0.5 } });
    expect(nightLearningSample(record).eligibleForCueLevel).toBe(true);
    expect(adaptiveRecipeSample(record).eligibleForEnvironment).toBe(true);
  });

  it('applies one threshold to both learners', () => {
    const justAbove = night({ volume: { min: MIN_OUTPUT_VOLUME + 0.01, max: MIN_OUTPUT_VOLUME + 0.01 } });
    const justBelow = night({ volume: { min: MIN_OUTPUT_VOLUME - 0.01, max: MIN_OUTPUT_VOLUME - 0.01 } });
    expect(nightLearningSample(justAbove).exclusion).toBeUndefined();
    expect(adaptiveRecipeSample(justAbove).exclusion).toBeUndefined();
    expect(nightLearningSample(justBelow).exclusion).toBe('volume_low');
    expect(adaptiveRecipeSample(justBelow).exclusion).toBe('volume_low');
  });

  it('keeps the rules out of the learners and the screen', () => {
    const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    for (const file of ['core/nightLearning.ts', 'core/adaptiveRecipeLearning.ts', 'screens/PracticeMemoryScreen.tsx']) {
      const source = read(file);
      expect(source).not.toMatch(/const (MIN_OUTPUT_VOLUME|MAX_VOLUME_SPREAD)\b/);
      expect(source).not.toMatch(/function (sameVolumeBand|sameOptionalNumber|executionFor)\b/);
      expect(source).not.toMatch(/return 'route_changed'|return 'volume_low'|return 'volume_changed'|return 'quiet_night'/);
      expect(source).not.toContain('EVIDENCE_EXCLUSION_LABELS');
    }
  });
});
