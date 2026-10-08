import type { JournalEntry } from './journalRepo';
import type { JourneyMemorySession } from './journeyMemory';
import type { NightRecord } from './nightRecords';
import { deriveRecurringDreamSignal } from './recurringDreamSignals';
import { deriveCueLevelAdjustment } from './nightLearning';
import { deriveSupportedEnvironmentAdjustment } from './adaptiveRecipeLearning';
import { adaptiveRecipeSample } from './adaptiveRecipeLearning';
import type { NightPlanConfiguration } from './nightPlans';
import {
  MIN_RECOGNITION_FOCUS_NIGHTS,
  recognitionFocusObservationForSign,
} from './recognitionFocusLearning';

export type TonightRecommendation = {
  id: string;
  kind: 'gentler_signal' | 'clearer_signal' | 'recurring_signal' | 'repeat_environment' | 'recognition_refresh' | 'repeat_recipe';
  title: string;
  reason: string;
  actionLabel: string;
  sign?: string;
  environment?: string;
  signalGainScale?: number;
  recipeConfiguration?: NightPlanConfiguration;
};

function environmentRecommendation(records: NightRecord[]): TonightRecommendation | null {
  const adjustment = deriveSupportedEnvironmentAdjustment(records);
  if (!adjustment) return null;
  const label = adjustment.environment.charAt(0).toUpperCase() + adjustment.environment.slice(1);
  return {
    id: `environment:${adjustment.environment}`,
    kind: 'repeat_environment',
    title: `Return to ${label}`,
    reason: adjustment.reason,
    actionLabel: `SHAPE ANOTHER ${label.toLocaleUpperCase()} NIGHT`,
    environment: adjustment.environment,
  };
}

function recipeComparisonKey(record: NightRecord): string | null {
  const recipe = record.practiceContext?.nightPlan?.recipe;
  if (!recipe) return null;
  return JSON.stringify({
    durationMinutes: recipe.durationMinutes,
    environment: recipe.environment,
    feel: recipe.feel,
    signalId: recipe.recognition.signalId,
    cuePlan: recipe.recognition.cuePlan,
    windows: recipe.recognition.windows.map(window => ({
      cueAtMinute: window.cueAtMinute,
      signalGainScale: window.signalGainScale,
      presentations: window.presentations,
    })),
    focus: recipe.recognition.intention?.sign.toLocaleLowerCase(),
  });
}

export function deriveTonightRecommendation(
  entries: JournalEntry[],
  records: NightRecord[],
  sessions: JourneyMemorySession[],
  now = Date.now(),
  options: { excludedKinds?: TonightRecommendation['kind'][] } = {},
): TonightRecommendation | null {
  const excludedKinds = new Set(options.excludedKinds ?? []);
  const eligibleEntries = entries.filter(entry => !entry.testSession);
  const eligibleRecords = records.filter(record => !record.testSession);
  const cueLevelAdjustment = deriveCueLevelAdjustment(eligibleRecords);
  if (cueLevelAdjustment?.direction === 'lower' && !excludedKinds.has('gentler_signal')) {
    return {
      id: 'signal:gentler',
      kind: 'gentler_signal',
      title: 'Lower the recognition signal',
      reason: cueLevelAdjustment.reason,
      actionLabel: 'REVIEW A QUIETER SIGNAL NIGHT',
      signalGainScale: cueLevelAdjustment.proposedGainScale,
    };
  }
  if (cueLevelAdjustment?.direction === 'raise' && !excludedKinds.has('clearer_signal')) {
    return {
      id: 'signal:clearer',
      kind: 'clearer_signal',
      title: 'Make the recognition signal slightly clearer',
      reason: cueLevelAdjustment.reason,
      actionLabel: 'REVIEW A CLEARER SIGNAL NIGHT',
      signalGainScale: cueLevelAdjustment.proposedGainScale,
    };
  }

  const recurring = deriveRecurringDreamSignal(eligibleEntries);
  if (!excludedKinds.has('recurring_signal') && recurring) {
    const focusOutcome = recognitionFocusObservationForSign(eligibleRecords, recurring.sign);
    const outcomeSupported = Boolean(
      focusOutcome && focusOutcome.answeredNights >= MIN_RECOGNITION_FOCUS_NIGHTS,
    );
    const needsRecognitionRehearsal = Boolean(
      outcomeSupported
      && focusOutcome
      && focusOutcome.appearedNights >= 2
      && focusOutcome.recognitionAnsweredNights >= 2
      && focusOutcome.recognizedNights === 0,
    );
    const outcomeReason = outcomeSupported && focusOutcome
      ? ` In focused nights, it appeared in ${focusOutcome.appearedNights} of ${focusOutcome.answeredNights} answered focus nights${focusOutcome.recognitionAnsweredNights
        ? ` and was recognized in ${focusOutcome.recognizedNights} of ${focusOutcome.recognitionAnsweredNights} reported appearances`
        : ''}.`
      : '';
    return {
      id: `dream-sign:${recurring.sign.toLocaleLowerCase()}`,
      kind: 'recurring_signal',
      title: needsRecognitionRehearsal ? `Strengthen ${recurring.sign} recognition` : `Recognize ${recurring.sign}`,
      reason: `${recurring.sign} appeared in ${recurring.count} of your last ${recurring.rememberedDreams} remembered dreams.${outcomeReason}`,
      actionLabel: outcomeSupported
        ? `${needsRecognitionRehearsal ? 'REHEARSE' : 'CONTINUE WITH'} ${recurring.sign.toLocaleUpperCase()}`
        : `PRACTICE WITH ${recurring.sign.toLocaleUpperCase()}`,
      sign: recurring.sign,
    };
  }

  if (!excludedKinds.has('repeat_environment')) {
    const environment = environmentRecommendation(eligibleRecords);
    if (environment) return environment;
  }

  const recentCutoff = now - 7 * 24 * 60 * 60_000;
  const outcomeCutoff = now - 30 * 24 * 60 * 60_000;
  const recentRecognition = sessions.some(session => session.journeyId === 'lucid-signal' && session.startedAt >= recentCutoff);
  const hasRecentOutcome = eligibleRecords.some(record => record.reflectedAt >= outcomeCutoff);
  if (!excludedKinds.has('recognition_refresh') && eligibleRecords.length >= 3 && hasRecentOutcome && !recentRecognition) {
    return {
      id: 'recognition:refresh',
      kind: 'recognition_refresh',
      title: 'Refresh recognition',
      reason: 'Recognition practice has not appeared in your last seven days of recorded practice.',
      actionLabel: 'OPEN LUCID SIGNAL',
    };
  }

  if (!excludedKinds.has('repeat_recipe')) {
    const latestComparable = [...eligibleRecords]
      .sort((left, right) => right.reflectedAt - left.reflectedAt)
      .find(record => adaptiveRecipeSample(record).eligibleForEnvironment);
    const recipe = latestComparable?.practiceContext?.nightPlan?.recipe;
    if (recipe && latestComparable && latestComparable.reflectedAt >= outcomeCutoff) {
      const latestKey = recipeComparisonKey(latestComparable);
      const comparableCount = eligibleRecords.filter(record => (
        adaptiveRecipeSample(record).eligibleForEnvironment
        && recipeComparisonKey(record) === latestKey
      )).length;
      const label = recipe.environment.charAt(0).toUpperCase() + recipe.environment.slice(1);
      return {
        id: `recipe:repeat:${recipe.id}`,
        kind: 'repeat_recipe',
        title: `Repeat the ${label} recipe`,
        reason: comparableCount < 3
          ? `${comparableCount} comparable ${comparableCount === 1 ? 'night is' : 'nights are'} recorded. Repeating the same setup will help Inner establish a baseline.`
          : 'No single outcome currently justifies changing the recipe. Repeating a stable setup will make the next observation more useful.',
        actionLabel: 'REVIEW THE SAME NIGHT',
        recipeConfiguration: {
          durationMinutes: recipe.durationMinutes,
          environment: recipe.environment,
          feel: recipe.feel,
          signalId: recipe.recognition.signalId,
          cuePlan: recipe.recognition.cuePlan,
          recognitionWindowCount: recipe.recognition.windows.length,
          signalGainScale: recipe.recognition.windows.length
            ? recipe.recognition.windows.reduce((sum, window) => sum + window.signalGainScale, 0) / recipe.recognition.windows.length
            : undefined,
        },
      };
    }
  }
  return null;
}
