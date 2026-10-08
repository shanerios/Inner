import { describe, expect, it } from '@jest/globals';
import { derivePracticeState } from '../practiceState';
import type { NightRecord } from '../nightRecords';

function record(
  id: string,
  options: {
    sleepImpact?: 'none' | 'gentle' | 'woke';
    signalExperience?: 'in_dream' | 'while_waking' | 'both' | 'unsure' | 'not_noticed';
    focus?: { appeared: 'yes' | 'no'; recognized?: 'yes' | 'no' };
    prepared?: boolean;
    practicedSignal?: 'guardian' | 'droplets';
  } = {},
): NightRecord {
  const intention = options.focus ? {
    type: 'recurring_dream_sign' as const,
    sign: 'Water',
    selectedAt: 1,
    evidence: { appearances: 3, rememberedDreams: 5 },
    ...(options.prepared ? {
      completedPractice: {
        sessionId: `practice-${id}`,
        completedAt: 1,
        signalId: options.practicedSignal ?? 'guardian' as const,
        presentationCount: 7,
        protocolVersion: 1 as const,
      },
    } : {}),
  } : undefined;
  return {
    schemaVersion: 1,
    id,
    source: 'overnight_journey',
    sourceSessionId: id,
    scheduledAt: 1,
    sleepOnsetAt: 1,
    reviewAt: 2,
    reflectedAt: Number(id),
    outcome: {
      recall: options.focus ? 'dream' : 'none',
      sleepImpact: options.sleepImpact,
      signalExperience: options.signalExperience,
      dreamDetails: options.focus ? {
        recognitionFocus: { sign: 'Water', ...options.focus },
      } : undefined,
    },
    practiceContext: {
      linkedAt: 3,
      links: [{
        sessionId: id,
        type: 'overnight_journey',
        startedAt: 1,
        linkReason: 'exact_overnight_session',
        nightExecution: {
          status: 'completed', startedAt: 1, endedAt: 2,
          plannedCues: [{ cueId: 'cue-1' }],
          deliveredCues: [{ cueId: 'cue-1', firedAt: 2 }],
          missingCueIds: [], audioRoute: 'private', interruptionCount: 0,
        },
      }],
      nightPlan: {
        id: `plan-${id}`, createdAt: 1, source: 'manual', userChanged: [],
        configuration: {
          durationMinutes: 420, environment: 'ocean', feel: 'gentle', signalId: 'guardian',
          cuePlan: 'gentle', recognitionWindowCount: 1, signalGainScale: 1,
        },
        recipe: {
          schemaVersion: 2, id: `recipe-${id}`, createdAt: 1, seed: 1,
          goal: 'lucid_recognition', durationMinutes: 420, environment: 'ocean', feel: 'gentle',
          preparation: { practice: 'lucid_signal', durationMinutes: 7 },
          recognition: {
            signalId: 'guardian', cuePlan: 'gentle', intention,
            windows: [{ id: 'cue-1', cueAtMinute: 300, signalGainScale: 1, presentations: 1, backgroundDuckGain: 0.55, recoverySeconds: 35 }],
          },
          environmentArc: 'protected_standard',
        },
      },
    },
  };
}

describe('practice state', () => {
  it('starts by establishing a baseline', () => {
    expect(derivePracticeState([record('1')], 100).objective.id).toBe('establish_baseline');
  });

  it('protects sleep before optimizing another outcome', () => {
    const state = derivePracticeState([
      record('1', { sleepImpact: 'woke' }),
      record('2', { sleepImpact: 'woke' }),
      record('3', { sleepImpact: 'none' }),
    ]);
    expect(state.objective.id).toBe('protect_sleep');
  });

  it('strengthens a recurring sign after repeated appearances without recognition', () => {
    const state = derivePracticeState([
      record('1', { sleepImpact: 'none', focus: { appeared: 'yes', recognized: 'no' }, prepared: true }),
      record('2', { sleepImpact: 'none', focus: { appeared: 'yes', recognized: 'no' }, prepared: true }),
      record('3', { sleepImpact: 'none', focus: { appeared: 'no' }, prepared: true }),
    ]);
    expect(state.objective.id).toBe('strengthen_recognition');
    expect(state.recognition).toEqual(expect.objectContaining({
      focus: 'Water', preparedFocusNights: 3, matchedPreparationNights: 3,
    }));
  });

  it('separates dream incorporation from noticing the signal while waking', () => {
    const state = derivePracticeState([
      record('1', { sleepImpact: 'none', signalExperience: 'in_dream' }),
      record('2', { sleepImpact: 'none', signalExperience: 'while_waking' }),
      record('3', { sleepImpact: 'none', signalExperience: 'both' }),
    ]);
    expect(state.signalExperience).toEqual(expect.objectContaining({
      inDreamNights: 1, whileWakingNights: 1, bothNights: 1,
    }));
  });
});
