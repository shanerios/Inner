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
    links: [],
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
    },
  },
});

describe('adaptive night proposals', () => {
  it('turns repeated waking into a gentler editable night', () => {
    expect(adaptiveNightProposalFromRecommendation(recommendation({}))).toEqual(expect.objectContaining({
      rule: 'gentler_signal',
      proposedConfiguration: { feel: 'gentle', cuePlan: 'gentle' },
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
    expect(adaptiveProposalIsPaused(adaptiveNightProposalFromRecommendation(recommendation({})), evaluations)).toBe(true);
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
});
