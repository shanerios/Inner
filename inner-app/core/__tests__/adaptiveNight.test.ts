import { describe, expect, it } from '@jest/globals';
import {
  adaptiveNightProposalFromRecommendation,
  adaptiveProposalIsPaused,
  deriveAdaptiveRuleEvaluations,
} from '../adaptiveNight';
import type { TonightRecommendation } from '../tonightRecommendation';
import type { NightRecord } from '../nightRecords';

const recommendation = (overrides: Partial<TonightRecommendation>): TonightRecommendation => ({
  id: 'test',
  kind: 'gentler_signal',
  title: 'Test',
  reason: 'Observed in recent reflected nights.',
  actionLabel: 'REVIEW',
  ...overrides,
});

const adaptiveRecord = (
  id: string,
  rule: 'gentler_signal' | 'supported_environment',
  outcome: NightRecord['outcome'],
  userChanged: string[] = [],
  interrupted = false,
): NightRecord => ({
  schemaVersion: 1,
  id,
  source: 'overnight_journey',
  sourceSessionId: id,
  scheduledAt: 1,
  sleepOnsetAt: 1,
  reviewAt: 2,
  reflectedAt: Number(id.replace(/\D/g, '')) || 1,
  outcome,
  practiceContext: {
    linkedAt: 2,
    links: [{
      sessionId: id,
      type: 'overnight_journey',
      startedAt: 1,
      linkReason: 'exact_overnight_session',
      environment: 'ocean',
      nightExecution: {
        status: 'completed',
        startedAt: 1,
        endedAt: 2,
        plannedCues: [{ cueId: 'cue-1' }, { cueId: 'cue-2' }],
        deliveredCues: [{ cueId: 'cue-1', firedAt: 2 }, { cueId: 'cue-2', firedAt: 3 }],
        missingCueIds: [],
        audioRoute: 'private',
        interruptionCount: interrupted ? 1 : 0,
      },
    }],
    nightPlan: {
      id: `plan-${id}`,
      createdAt: 1,
      source: 'adaptive_rule',
      configuration: {
        durationMinutes: 450,
        environment: 'ocean',
        feel: 'gentle',
        signalId: 'bell',
        cuePlan: 'gentle',
        recognitionWindowCount: 2,
      },
      userChanged: userChanged as any,
      adaptiveRule: { id: `adaptive-${rule}`, rule, title: rule === 'gentler_signal' ? 'A gentler recognition night' : 'Return to Ocean' },
      recipe: {
        schemaVersion: 2,
        id: `recipe-${id}`,
        createdAt: 1,
        seed: 1,
        goal: 'lucid_recognition',
        durationMinutes: 450,
        environment: 'ocean',
        feel: 'gentle',
        preparation: { practice: 'lucid_signal', durationMinutes: 7 },
        recognition: {
          signalId: 'bell',
          cuePlan: 'gentle',
          windows: [
            { id: 'cue-1', cueAtMinute: 300, signalGainScale: 1, presentations: 1, backgroundDuckGain: 0.55, recoverySeconds: 35 },
            { id: 'cue-2', cueAtMinute: 380, signalGainScale: 1, presentations: 1, backgroundDuckGain: 0.55, recoverySeconds: 35 },
          ],
        },
        environmentArc: 'protected_standard',
      },
    },
  },
});

describe('adaptive night proposals', () => {
  it('turns repeated waking into a gentler editable night', () => {
    const proposal = adaptiveNightProposalFromRecommendation(recommendation({ signalGainScale: 0.85 }));
    expect(proposal).toEqual(expect.objectContaining({
      rule: 'gentler_signal',
      proposedConfiguration: { signalGainScale: 0.85 },
    }));
    expect(Object.keys(proposal?.proposedConfiguration ?? {})).toHaveLength(1);
  });

  it('does not construct an unconstrained signal proposal without a learned level', () => {
    expect(adaptiveNightProposalFromRecommendation(recommendation({}))).toBeNull();
  });

  it('carries a learned cue level into an editable night proposal', () => {
    expect(adaptiveNightProposalFromRecommendation(recommendation({ signalGainScale: 0.85 }))).toEqual(expect.objectContaining({
      rule: 'gentler_signal',
      proposedConfiguration: { signalGainScale: 0.85 },
    }));
    expect(adaptiveNightProposalFromRecommendation(recommendation({
      kind: 'clearer_signal',
      signalGainScale: 1.1,
    }))).toEqual(expect.objectContaining({
      rule: 'clearer_signal',
      proposedConfiguration: { signalGainScale: 1.1 },
    }));
  });

  it('carries a supported environment into the proposed night', () => {
    expect(adaptiveNightProposalFromRecommendation(recommendation({
      kind: 'repeat_environment',
      environment: 'ocean',
    }))).toEqual(expect.objectContaining({
      rule: 'supported_environment',
      proposedConfiguration: { environment: 'ocean' },
    }));
  });

  it('keeps waking recognition practices out of the night constructor', () => {
    expect(adaptiveNightProposalFromRecommendation(recommendation({ kind: 'recurring_signal' }))).toBeNull();
    expect(adaptiveNightProposalFromRecommendation(recommendation({ kind: 'recognition_refresh' }))).toBeNull();
  });

  it('pauses a gentler-signal rule when it still repeatedly wakes the user', () => {
    const evaluations = deriveAdaptiveRuleEvaluations([
      adaptiveRecord('1', 'gentler_signal', { recall: 'none', sleepImpact: 'woke' }),
      adaptiveRecord('2', 'gentler_signal', { recall: 'none', sleepImpact: 'woke' }),
    ]);
    expect(evaluations[0]).toEqual(expect.objectContaining({ status: 'paused', acceptedAttempts: 2 }));
    expect(adaptiveProposalIsPaused(adaptiveNightProposalFromRecommendation(recommendation({ signalGainScale: 0.85 })), evaluations)).toBe(true);
  });

  it('pauses a rule when the proposed setting is repeatedly overridden', () => {
    const evaluations = deriveAdaptiveRuleEvaluations([
      adaptiveRecord('1', 'supported_environment', { recall: 'dream' }, ['environment']),
      adaptiveRecord('2', 'supported_environment', { recall: 'dream' }, ['environment']),
      adaptiveRecord('3', 'supported_environment', { recall: 'dream' }),
    ]);
    expect(evaluations[0]).toEqual(expect.objectContaining({ status: 'paused', overrideCount: 2 }));
  });

  it('describes early outcomes as observations without causal language', () => {
    const evaluations = deriveAdaptiveRuleEvaluations([
      adaptiveRecord('1', 'supported_environment', { recall: 'dream' }),
      adaptiveRecord('2', 'supported_environment', { recall: 'none' }),
    ]);
    expect(evaluations[0]).toEqual(expect.objectContaining({ status: 'observed' }));
    expect(evaluations[0].evidence).toContain('not evidence');
  });

  it('does not evaluate an interrupted adaptive night as supporting evidence', () => {
    const evaluations = deriveAdaptiveRuleEvaluations([
      adaptiveRecord('1', 'supported_environment', { recall: 'dream' }),
      adaptiveRecord('2', 'supported_environment', { recall: 'dream' }, [], true),
    ]);
    expect(evaluations[0]).toEqual(expect.objectContaining({
      status: 'collecting',
      attempts: 2,
      acceptedAttempts: 1,
    }));
  });
});
