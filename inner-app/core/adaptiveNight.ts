import type { NightPlanConfiguration } from './nightPlans';
import type { TonightRecommendation } from './tonightRecommendation';
import type { NightRecord } from './nightRecords';

export type AdaptiveNightRule = 'gentler_signal' | 'supported_environment';

export type AdaptiveNightProposal = {
  id: string;
  rule: AdaptiveNightRule;
  title: string;
  reason: string;
  proposedConfiguration: Partial<NightPlanConfiguration>;
};

export type AdaptiveRuleEvaluation = {
  rule: AdaptiveNightRule;
  title: string;
  attempts: number;
  acceptedAttempts: number;
  overrideCount: number;
  status: 'collecting' | 'observed' | 'paused';
  label: 'LEARNING' | 'OBSERVED' | 'RULE PAUSED';
  text: string;
  evidence: string;
};

const TARGET_FIELDS: Record<AdaptiveNightRule, Array<keyof NightPlanConfiguration>> = {
  gentler_signal: ['feel', 'cuePlan'],
  supported_environment: ['environment'],
};

/**
 * Converts evidence-based recommendations into editable night proposals.
 * Waking practices remain separate because they do not configure an Overnight Journey.
 */
export function adaptiveNightProposalFromRecommendation(
  recommendation: TonightRecommendation | null,
): AdaptiveNightProposal | null {
  if (!recommendation) return null;

  if (recommendation.kind === 'gentler_signal') {
    return {
      id: `adaptive:${recommendation.id}`,
      rule: 'gentler_signal',
      title: 'A gentler recognition night',
      reason: recommendation.reason,
      proposedConfiguration: {
        feel: 'gentle',
        cuePlan: 'gentle',
      },
    };
  }

  if (recommendation.kind === 'repeat_environment' && recommendation.environment) {
    const environment = recommendation.environment;
    return {
      id: `adaptive:${recommendation.id}`,
      rule: 'supported_environment',
      title: `Return to ${environment.charAt(0).toUpperCase()}${environment.slice(1)}`,
      reason: recommendation.reason,
      proposedConfiguration: { environment },
    };
  }

  return null;
}

export function deriveAdaptiveRuleEvaluations(records: NightRecord[]): AdaptiveRuleEvaluation[] {
  const eligible = records
    .filter(record => !record.testSession && record.practiceContext?.nightPlan?.source === 'adaptive_rule')
    .filter(record => Boolean(record.practiceContext?.nightPlan?.adaptiveRule));
  const rules = new Map<AdaptiveNightRule, NightRecord[]>();
  eligible.forEach(record => {
    const rule = record.practiceContext?.nightPlan?.adaptiveRule?.rule;
    if (!rule) return;
    rules.set(rule, [...(rules.get(rule) ?? []), record]);
  });

  return [...rules.entries()].map(([rule, ruleRecords]) => {
    const sorted = [...ruleRecords].sort((a, b) => b.reflectedAt - a.reflectedAt);
    const fields = TARGET_FIELDS[rule];
    const overridden = sorted.filter(record => fields.some(field => record.practiceContext?.nightPlan?.userChanged.includes(field)));
    const accepted = sorted.filter(record => !fields.some(field => record.practiceContext?.nightPlan?.userChanged.includes(field)));
    const recentOverrideCount = sorted.slice(0, 3)
      .filter(record => fields.some(field => record.practiceContext?.nightPlan?.userChanged.includes(field))).length;
    const title = sorted[0]?.practiceContext?.nightPlan?.adaptiveRule?.title
      ?? (rule === 'gentler_signal' ? 'A gentler recognition night' : 'Supported environment');

    if (recentOverrideCount >= 2) {
      return {
        rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
        status: 'paused', label: 'RULE PAUSED',
        text: `Inner paused ${title.toLocaleLowerCase()} because you repeatedly chose different settings.`,
        evidence: `You changed the proposed ${rule === 'gentler_signal' ? 'feel or cue plan' : 'environment'} on ${overridden.length} of ${sorted.length} reflected adaptive nights.`,
      };
    }

    if (rule === 'gentler_signal') {
      const answered = accepted.filter(record => Boolean(record.outcome.sleepImpact));
      const woke = answered.filter(record => record.outcome.sleepImpact === 'woke').length;
      if (answered.length >= 2 && woke >= Math.ceil(answered.length / 2)) {
        return {
          rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
          status: 'paused', label: 'RULE PAUSED',
          text: 'The gentler plan still appeared disruptive, so Inner paused this adjustment.',
          evidence: `You reported being woken on ${woke} of ${answered.length} accepted gentler-signal nights.`,
        };
      }
      if (answered.length >= 2) {
        return {
          rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
          status: 'observed', label: 'OBSERVED',
          text: 'The gentler signal plan has not usually woken you in the reflected nights so far.',
          evidence: `You reported being woken on ${woke} of ${answered.length} accepted gentler-signal nights. Inner will keep observing.`,
        };
      }
    }

    if (rule === 'supported_environment') {
      const answered = accepted.filter(record => Boolean(record.outcome.recall));
      const recalled = answered.filter(record => record.outcome.recall !== 'none').length;
      if (answered.length >= 3 && recalled === 0) {
        return {
          rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
          status: 'paused', label: 'RULE PAUSED',
          text: 'Recent outcomes did not continue the earlier environment pattern, so Inner paused this suggestion.',
          evidence: `None of ${answered.length} accepted adaptive nights included dream recall.`,
        };
      }
      if (answered.length >= 2) {
        return {
          rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
          status: 'observed', label: 'OBSERVED',
          text: `${title} has accompanied dream recall on ${recalled} of ${answered.length} reflected adaptive nights.`,
          evidence: 'This is an observation in your reports, not evidence that the environment caused recall.',
        };
      }
    }

    return {
      rule, title, attempts: sorted.length, acceptedAttempts: accepted.length, overrideCount: overridden.length,
      status: 'collecting', label: 'LEARNING',
      text: `Inner is observing what happens after ${title.toLocaleLowerCase()}.`,
      evidence: `${sorted.length} reflected adaptive ${sorted.length === 1 ? 'night' : 'nights'} so far. More outcomes are needed.`,
    };
  });
}

export function adaptiveProposalIsPaused(
  proposal: AdaptiveNightProposal | null,
  evaluations: AdaptiveRuleEvaluation[],
): boolean {
  return Boolean(proposal && evaluations.some(evaluation => evaluation.rule === proposal.rule && evaluation.status === 'paused'));
}
